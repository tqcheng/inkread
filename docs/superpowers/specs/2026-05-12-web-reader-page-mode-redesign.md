# Web Reader Page Mode Redesign

## Goal

Rebuild the frontend page-reading mode to match the feel of WeRead Web more closely: stable adaptive pagination, accurate position recovery after layout changes, chapter-based loading, and a restrained reading UI that keeps content primary.

## Current Problems

The current page mode is centered on `frontend/src/hooks/useTextPagination.ts`, which estimates page size from container height and a rough characters-per-line constant. This causes several structural issues:

- pagination is approximate rather than layout-accurate
- page boundaries drift when font size, line height, or viewport width changes
- progress recovery depends too heavily on a single offset-to-page lookup
- `frontend/src/pages/Reader.tsx` mixes fetching, pagination, progress restore, interaction rules, and dual-mode behavior in one component

These problems make the current page mode unsuitable for a WeRead-like reading experience.

## Scope

This redesign applies to the **Web page mode only**.

Included:

- page mode architecture and UI shell
- chapter-based content loading and preloading
- measured pagination engine
- reading position model and restore behavior
- page-turn interaction, keyboard shortcuts, and toolbar behavior

Excluded for this phase:

- scroll mode redesign
- 3D curl/page-flip effects
- annotations, highlights, notes, or TTS
- full-book exact total-page precomputation

## Product Direction

The target is a restrained desktop web reader:

- centered reading stage with narrow comfortable line width
- left tap/click zone for previous page, right for next page, center for toolbar
- light page transition instead of heavy animation
- hidden-by-default toolbars
- stable visual location after resizing or changing typography

The reader should behave like a dedicated book reader, not like a document viewer.

## Architecture

### 1. ReaderPageShell

Owns the page-mode layout and interaction frame:

- stage background and centered content page
- click/tap hot zones
- keyboard events (`ArrowLeft`, `ArrowRight`, `Space`, `Escape`)
- toolbar visibility state
- transition state for page changes

This layer does not compute pagination.

### 2. ChapterContentSource

Owns chapter content retrieval for page mode:

- fetch current chapter content
- preload previous and next chapters
- expose chapter metadata for TOC and progress UI
- provide content slices to the pagination engine

It replaces the current “large content block” page-mode fetch path in `Reader.tsx`.

### 3. PaginationEngine

A new measured pagination engine replaces `useTextPagination`.

Responsibilities:

- tokenize chapter text into blocks: chapter title, paragraph, blank line, divider
- render blocks into a hidden measurement container with the same width, padding, font size, and line height as the visible page
- accumulate blocks until page height is exceeded
- keep whole paragraphs together when possible
- use binary search for long-paragraph intra-block splitting
- avoid leaving chapter titles alone at the bottom of a page

Output:

- `pages[]`
- per-page offsets
- chapter-local page index
- anchor offsets used for recovery

### 4. ReadingPositionModel

Page mode uses a dual-anchor position model:

- `chapterIndex`: active chapter
- `anchorOffset`: primary text anchor inside the chapter
- `pageIndex`: current page index under the current layout

Rules:

- use `pageIndex` for fast same-layout navigation
- use `anchorOffset` to recover after font, line-height, or viewport changes
- persist anchor updates after page changes, TOC jumps, and search-result jumps

This replaces the current looser “offset maps to page if lucky” behavior.

### 5. PageModeController

Coordinates the shell, content source, and pagination engine:

- turn page within the current chapter
- cross chapter boundaries
- jump from TOC
- jump from search result offset
- re-run pagination after layout changes
- restore the nearest visual reading location after re-pagination

## Pagination Algorithm

1. Split chapter content into semantic blocks.
2. Render blocks in a hidden measurement layer using the same page CSS as the visible reader.
3. Add blocks to the current page until height overflow occurs.
4. If a whole block does not fit:
   - move it to the next page if the current page already has content
   - otherwise split within the block using binary search on character range
5. Emit a page object with:
   - `chapterIndex`
   - `pageInChapter`
   - `startOffset`
   - `endOffset`
   - `anchorOffset`
   - rendered block slice metadata

The engine is chapter-scoped. It does not paginate the full book upfront.

## Loading and Cache Strategy

Page mode should paginate only what it needs:

- paginate the current chapter immediately
- preload previous and next chapters
- cache chapter pagination by a layout key composed of viewport width, viewport height, font size, line height, and chapter id
- invalidate cache only when those inputs change

This keeps pagination responsive while avoiding expensive full-book work.

## Progress Recovery

Recovery behavior is critical and should be deterministic:

- same layout: restore directly by `pageIndex`
- changed layout: map `anchorOffset` into the new `pages[]`
- TOC jump: open the first page of the target chapter
- search jump: locate the page containing the hit offset and make that page current
- chapter boundary moves: prefer the nearest valid adjacent page rather than snapping back to chapter start

When typography changes, the user should stay near the same sentence or paragraph rather than jump visibly backward.

## UI and Interaction

Page mode UI should be rebuilt around a dedicated reading shell:

- full-screen reader background using theme colors
- centered content page with comfortable desktop width
- left 30% click zone: previous page
- center 40% click zone: toggle toolbar
- right 30% click zone: next page
- keyboard shortcuts for previous/next page and dismissing panels
- top bar for back, title, TOC, and search
- bottom bar for chapter name, chapter page progress, and settings
- right-side drawer for TOC and search

Animation should be subtle:

- use a light horizontal slide or fade transition
- no heavy 3D page curl
- animation must never block pagination or progress persistence

## Error Handling and Fallbacks

- if chapter pagination fails, show a recoverable error state with reload action
- if measurement returns no valid pages, fall back to a single-page chapter render and log the failure path
- if preloaded adjacent chapters fail, keep current chapter readable and retry lazily
- if search hit offset cannot be mapped exactly after re-pagination, land on the nearest page whose range surrounds the anchor

## Testing Strategy

### Unit

- block tokenization
- binary-search splitting for oversized paragraphs
- offset-to-page lookup
- anchor-based restore after layout change
- cross-chapter previous/next page transitions

### Integration

- page mode opens at saved position
- font size change keeps reader near the same content
- viewport resize re-paginates and restores correctly
- TOC jump lands on the right chapter page
- search result jump lands on the page containing the match

### UI

- center click toggles toolbar
- left/right click zones turn pages correctly
- keyboard navigation works without interfering with focused inputs in search/settings panels

## Implementation Direction

The practical implementation should replace the current page-mode path incrementally:

1. introduce the new page-mode shell and controller beside the current reader logic
2. replace `useTextPagination` with the measured engine for page mode only
3. migrate page-mode progress restore to the dual-anchor model
4. move TOC/search/page-jump behavior onto the new controller
5. leave scroll mode on the existing path for this phase

## Acceptance Criteria

- page boundaries are based on measured layout, not character-count estimation
- changing font size or viewport does not send the user back to chapter start
- previous/next page can cross chapter boundaries cleanly
- TOC and search jumps land on the expected page
- the reading UI is visually quieter and closer to WeRead Web than the current implementation
