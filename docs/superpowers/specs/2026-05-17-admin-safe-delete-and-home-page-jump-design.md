# Admin Safe Delete And Home Page Jump Design

## Goal

Adjust destructive admin flows so routine library cleanup uses explicit confirmation instead of a global gate, and make homepage pagination faster to use by adding a direct page-jump control next to the existing sort controls.

This design targets:

- backend admin routes in `backend/app/routers/admin.py`
- admin auth middleware in `backend/app/middleware/admin_auth.py`
- homepage UI in `frontend/src/pages/Home.tsx`
- admin UI in `frontend/src/pages/Admin.tsx`

## Scope

In scope:

- remove the current global maintenance gate for `/api/v1/admin/*`
- keep batch delete and database reset limited to database effects only
- add explicit confirmation before batch delete and database reset
- add a homepage page-jump dropdown near the sort controls
- add regression coverage for the new backend and frontend behavior

Out of scope:

- deleting original source files as part of batch delete or reset
- introducing a new role or permission system
- changing reader-page jump behavior
- redesigning homepage pagination beyond the added dropdown

## Current Constraints

At the time of this design, all `/api/v1/admin/*` endpoints were blocked by a global middleware gate. That conflicted with the new product rule: batch delete and database reset should be available as long as they do not delete original files.

The homepage already supports paginated book queries through `page` state and `Pagination`, but there is no direct way to jump to a specific result page from the sort row.

## Backend Design

Remove the global maintenance gate by deleting the `/api/v1/admin` path check from the middleware layer.

For this change set, `POST /api/v1/admin/batch-delete` and `POST /api/v1/admin/reset` remain safe-by-default operations:

- `batch-delete` continues to soft-delete selected books in the database only
- `reset` continues to clear database tables only
- neither endpoint accepts or performs source-file deletion

This keeps behavior aligned with the new rule without adding partial auth logic or route splits. If source-file deletion returns later, that should be introduced as a separate explicit feature with route-level destructive checks rather than another global middleware rule.

## Frontend Design

### Admin confirmations

The homepage admin bar batch-delete action will show a confirmation step before sending the request. The confirmation copy must state that:

- selected books will be removed from the database
- original source files will not be deleted

The admin page database reset action will also require a confirmation step before request submission. The confirmation copy must state that:

- the database will be cleared
- source files on disk will be preserved
- the library can be scanned again afterward

These confirmations replace the old assumption that the global gate itself was the destructive safeguard.

### Homepage page-jump dropdown

Add a compact page-jump dropdown to the homepage sort row, positioned to the left of the existing sort selector.

Behavior:

- show only when `data.pages > 1`
- options map directly to available result pages
- selecting an option updates the existing `page` state immediately
- the dropdown stays in sync when search, filters, or sorting reset pagination back to page 1

The control should reuse current pagination state instead of introducing a second source of truth.

## Data Flow

### Batch delete

1. User selects books in admin mode on the homepage.
2. User clicks batch delete.
3. Frontend shows a confirmation describing DB-only deletion.
4. On confirm, frontend calls `adminApi.batchDelete(...)`.
5. Backend soft-deletes matching book rows.
6. Frontend clears selection and refreshes the book list.

### Database reset

1. User opens the reset action on the admin page.
2. Frontend shows a confirmation describing DB-only reset.
3. On confirm, frontend calls `adminApi.resetDatabase()`.
4. Backend clears the existing tables in the current order.
5. Frontend invalidates cached queries and refreshes visible state.

### Homepage page jump

1. User opens the dropdown in the homepage sort row.
2. User selects a target page number.
3. Frontend updates the existing `page` state.
4. `useBooksQuery(...)` refetches the selected result page.
5. Existing `Pagination` stays consistent because it already derives from the same state.

## Error Handling

- Batch delete and reset should keep existing API error responses.
- Frontend confirmation state should close only after a successful action or explicit cancel.
- If batch delete or reset fails, keep the user on the current page and surface the existing failure handling.
- If the current page becomes out of range after filter or sort changes, the existing code path that resets to page 1 remains the source of truth.

## Testing

Backend coverage:

- requests to `/api/v1/admin/batch-delete` succeed with DB-only side effects
- requests to `/api/v1/admin/reset` succeed with DB-only side effects
- both endpoints continue to affect database rows only

Frontend coverage:

- homepage batch delete requires confirmation before mutation
- admin reset requires confirmation before mutation
- homepage sort row renders the page-jump dropdown when multiple pages exist
- selecting a page from the dropdown updates the active result page
- dropdown hides when only one page exists

## Rollout Notes

This is intentionally a narrow behavior change:

- remove the obsolete global maintenance gate
- make destructive intent explicit in the UI through confirmations
- add a small navigation improvement to homepage pagination

No migration or config change is required for this rollout.
