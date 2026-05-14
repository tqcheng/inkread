# Admin Book Dedup Design

## Goal

Add duplicate-book management to the admin experience without changing import behavior. Scanning should record a stable content fingerprint for each book, while duplicate resolution remains a manual admin action.

This design targets the current repository shape:

- backend scan/import logic in `backend/app/services/scanner.py`
- admin APIs in `backend/app/routers/admin.py`
- admin UI in `frontend/src/pages/Admin.tsx`

## Scope

In scope:

- record `content_md5` for scanned books
- avoid extra full-file reads just for hashing
- expose duplicate summary and grouped duplicate records in admin APIs
- add duplicate management UI to the existing admin page
- support manual resolution with optional source-file deletion

Out of scope:

- automatic dedup during scan
- enforcing `content_md5` uniqueness in the database
- deleting files by default
- merging chapter lists across duplicates

## Current Constraints

Today books are effectively matched by filename:

- `books.filename` is unique
- scan/update logic looks up existing books by filename

That means same-content files with different names can be imported multiple times. The project already has MD5-style hashing in `AiCache.file_hash`, but book records do not yet store their own content fingerprint.

## Data Model Changes

Add fields to `books`:

- `content_md5: string(32) | null`
- `file_mtime: datetime | null`
- `dedup_ignored_at: datetime | null` (optional but recommended)

Add a non-unique index on `content_md5`.

Keep the existing `filename` uniqueness contract unchanged in this phase.

## Scan Pipeline

Scan should compute MD5 from original file bytes, not decoded text. This avoids hash drift caused by encoding conversion.

Performance requirement:

- do not add a separate full-file read for hashing
- fold MD5 calculation into the existing full-file scan used for chapter extraction

Recommended shape:

- update chapter extraction to also stream bytes into an MD5 digest
- persist `content_md5` together with `file_size` and `file_mtime`
- if stored `file_size` and `file_mtime` are unchanged for an existing record, reuse the stored MD5 instead of recalculating it

This keeps duplicate detection incremental and suitable for large libraries with thousands of TXT files.

## Admin API

Add dedicated dedup endpoints under `/api/v1/admin/dedup`.

### `GET /summary`

Returns:

- `duplicate_groups`
- `duplicate_books`
- `ignored_groups` (optional)

### `GET /groups`

Paginated grouped results by `content_md5`.

Each group returns:

- `content_md5`
- `count`
- `recommended_keep_book_id`
- `items[]`

Each item includes:

- `id`
- `title`
- `filename`
- `file_path`
- `file_size`
- `file_mtime`
- `is_favorite`
- `last_read_position`
- `chapter_count`
- metadata completeness hints if needed

### `POST /resolve`

Request:

- `content_md5`
- `keep_book_id`
- `delete_book_ids[]`
- `mode: soft_delete | hard_delete`
- `delete_source_files: boolean`

Behavior:

- default path is safe: resolve duplicates without deleting source files
- source-file deletion is opt-in and defaults to `false`
- if `delete_source_files=true`, delete only removed duplicate files, never the kept file
- return per-file deletion results so partial failures are visible

## Resolution Rules

Duplicate resolution is group-based and admin-confirmed.

Recommended keep-book ranking:

1. book with meaningful reading progress
2. favorite book
3. more complete metadata
4. newer file modification time
5. stable tiebreaker by book ID

Merge rules when resolving a group:

- `is_favorite`: true if any duplicate is favorited
- reading position: keep the furthest progress
- manual metadata wins over AI metadata
- `reading_progress` rows should be migrated to the kept book
- `chapters` are not merged; the kept book keeps its own chapter data

Delete rules:

- `soft_delete`: mark removed books deleted in DB, keep files on disk
- `hard_delete`: remove DB records for deleted books
- `delete_source_files=true`: additionally remove deleted books' files from disk

Deleting source files must never be the default path.

## Admin UI

Implement dedup management as a new section inside `frontend/src/pages/Admin.tsx` first, not a separate page.

UI structure:

- summary card for duplicate groups and duplicate books
- grouped duplicate list below
- groups collapsed by default
- each group supports keep-selection and resolve actions

Each duplicate item should show:

- title
- filename
- path
- file size
- modified time
- favorite state
- reading progress
- chapter count

Each group should support:

- choose the book to keep
- soft delete the rest
- hard delete the rest
- checkbox: `同时删除被移除副本的原始文件`

If source-file deletion is enabled, show a clear destructive warning.

## Error Handling

Do not silently ignore file-delete failures.

`resolve` responses should report:

- books resolved successfully
- files deleted successfully
- files that failed deletion and why

If a hard-delete action partially fails at the filesystem layer, the API must make that outcome explicit so the admin can retry or repair manually.

## Testing

Backend coverage:

- scan writes `content_md5`
- unchanged files reuse stored MD5
- duplicate grouping returns correct groups
- resolve merges reading state and favorites correctly
- optional file deletion succeeds and failure paths are explicit

Frontend coverage:

- duplicate summary renders on admin page
- duplicate groups expand/collapse
- keep selection and resolve action submit expected payload
- source-file deletion checkbox defaults to off
- destructive warning appears when file deletion is enabled

## Rollout Notes

Roll out in two stages:

1. add MD5 recording and dedup APIs
2. add admin UI and manual resolution flow

Do not add automatic dedup or a unique `content_md5` constraint until production data has been cleaned and the manual flow has proven stable.
