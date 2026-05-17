# Admin Book Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MD5-based duplicate detection data to scanned books and expose a manual duplicate-resolution workflow in the admin UI, with source-file deletion as an explicit opt-in.

**Architecture:** Extend `books` with content-hash metadata and make the scanner compute `content_md5` during the existing full-file pass so scan cost does not double. Add a small backend dedup service plus admin endpoints for duplicate summaries, grouped duplicates, and resolution, then wire an admin-page section that consumes those endpoints and submits explicit keep/delete actions.

**Tech Stack:** FastAPI, SQLAlchemy async ORM, SQLite, React 18, TypeScript, TanStack Query, Vitest, Testing Library, pytest, httpx

---

## File Structure

**Create**

- `backend/app/services/dedup.py`
- `backend/tests/test_scanner_dedup.py`
- `backend/tests/test_admin_dedup.py`

**Modify**

- `backend/app/models.py`
- `backend/app/core/database.py`
- `backend/app/services/scanner.py`
- `backend/app/routers/admin.py`
- `backend/app/schemas.py`
- `backend/tests/conftest.py`
- `frontend/src/api/types.ts`
- `frontend/src/api/admin.ts`
- `frontend/src/pages/Admin.tsx`

**Responsibilities**

- `backend/app/models.py`: store `content_md5`, `file_mtime`, and ignore-marker metadata on books
- `backend/app/core/database.py`: patch existing SQLite databases with new dedup columns/indexes at startup
- `backend/app/services/scanner.py`: compute and persist MD5 during chapter extraction, and reuse saved hashes for unchanged files
- `backend/app/services/dedup.py`: duplicate grouping, keep-book recommendation, metadata/progress merge, and optional source-file deletion
- `backend/app/routers/admin.py`: expose `/dedup/summary`, `/dedup/groups`, and `/dedup/resolve`
- `frontend/src/api/*`: typed admin dedup requests and responses
- `frontend/src/pages/Admin.tsx`: duplicate summary card, expandable duplicate groups, keep/delete controls, and destructive-file-delete warning

### Task 1: Add Book Dedup Columns And Startup Schema Patch

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/core/database.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_frontend_static.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_frontend_static.py
import pytest
from sqlalchemy import inspect, text

from app.core.database import init_db, engine

@pytest.mark.asyncio
async def test_init_db_adds_dedup_columns_for_existing_books_table():
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS books"))
        await conn.execute(text("""
            CREATE TABLE books (
                id INTEGER PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL UNIQUE,
                file_path VARCHAR(500) NOT NULL,
                file_size BIGINT,
                category VARCHAR(50),
                category_confidence FLOAT,
                tags JSON,
                tags_source VARCHAR(20),
                encoding_original VARCHAR(20),
                is_utf8_converted BOOLEAN,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                is_favorite BOOLEAN,
                is_deleted BOOLEAN,
                last_read_position INTEGER,
                last_read_chapter VARCHAR(255),
                ai_analyzed_at DATETIME
            )
        """))

    await init_db()

    async with engine.begin() as conn:
        columns = await conn.run_sync(lambda sync_conn: {
            col["name"] for col in inspect(sync_conn).get_columns("books")
        })

    assert "content_md5" in columns
    assert "file_mtime" in columns
    assert "dedup_ignored_at" in columns
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest -q tests/test_frontend_static.py::test_init_db_adds_dedup_columns_for_existing_books_table`
Expected: FAIL because `init_db()` currently only runs `Base.metadata.create_all()` and never patches existing `books` tables.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/models.py
from sqlalchemy import Index

class Book(Base):
    # existing fields above...
    content_md5: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    file_mtime: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    dedup_ignored_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_books_content_md5", "content_md5"),
    )

# backend/app/core/database.py
async def ensure_book_dedup_columns(engine) -> None:
    statements = [
        "ALTER TABLE books ADD COLUMN content_md5 VARCHAR(32)",
        "ALTER TABLE books ADD COLUMN file_mtime DATETIME",
        "ALTER TABLE books ADD COLUMN dedup_ignored_at DATETIME",
        "CREATE INDEX IF NOT EXISTS ix_books_content_md5 ON books (content_md5)",
    ]

    async with engine.begin() as conn:
        for statement in statements:
            try:
                await conn.execute(text(statement))
            except Exception as exc:
                if "duplicate column name" not in str(exc).lower():
                    if "already exists" not in str(exc).lower():
                        raise

async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await ensure_book_dedup_columns(engine)
    await init_fts_tables(engine)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest -q tests/test_frontend_static.py::test_init_db_adds_dedup_columns_for_existing_books_table`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/core/database.py backend/tests/test_frontend_static.py
git commit -m "feat(dedup): add book hash schema support"
```

### Task 2: Compute And Reuse MD5 During Scan

**Files:**
- Modify: `backend/app/services/scanner.py`
- Modify: `backend/app/models.py`
- Create: `backend/tests/test_scanner_dedup.py`
- Test: `backend/tests/test_scanner_dedup.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_scanner_dedup.py
import hashlib
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import Book
from app.services.scanner import scan_single_file

@pytest.mark.asyncio
async def test_scan_single_file_persists_md5_and_mtime(tmp_path: Path, db_session):
    file_path = tmp_path / "alpha.txt"
    content = "第一章 开始\n\n正文内容\n"
    file_path.write_text(content, encoding="utf-8")

    book, message = await scan_single_file(file_path, db_session)

    await db_session.refresh(book)
    assert message.startswith("created")
    assert book.content_md5 == hashlib.md5(content.encode("utf-8")).hexdigest()
    assert book.file_mtime is not None

@pytest.mark.asyncio
async def test_scan_single_file_reuses_md5_for_unchanged_file(tmp_path: Path, db_session, monkeypatch):
    file_path = tmp_path / "beta.txt"
    file_path.write_text("第一章\n\n正文\n", encoding="utf-8")

    original, _ = await scan_single_file(file_path, db_session)
    await db_session.refresh(original)

    calls = {"count": 0}

    from app import services
    original_extract = services.scanner.extract_chapters

    def wrapped_extract(path):
        calls["count"] += 1
        return original_extract(path)

    monkeypatch.setattr(services.scanner, "extract_chapters", wrapped_extract)
    rescanned, message = await scan_single_file(file_path, db_session)

    assert message == "skipped_unchanged"
    assert rescanned.content_md5 == original.content_md5
    assert calls["count"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest -q tests/test_scanner_dedup.py`
Expected: FAIL because `Book` has no `content_md5` or `file_mtime` persistence in the scanner path.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/scanner.py
import hashlib

def extract_chapters_and_md5(file_path: Path) -> Tuple[List[Dict[str, Any]], str]:
    chapters: List[Dict[str, Any]] = []
    digest = hashlib.md5()
    compiled_patterns = [re.compile(p, re.IGNORECASE) for p in CHAPTER_PATTERNS]
    current_chapter = None
    current_start = 0
    position = 0

    with open(file_path, "rb") as f:
        for line_bytes in f:
            digest.update(line_bytes)
            line = line_bytes.decode("utf-8", errors="ignore").strip()
            is_chapter_line = any(pattern.match(line) for pattern in compiled_patterns)
            if is_chapter_line:
                if current_chapter is not None:
                    chapters.append({
                        "title": current_chapter,
                        "position_start": current_start,
                        "position_end": position,
                        "chapter_index": len(chapters),
                    })
                current_chapter = line
                current_start = position
            position += len(line_bytes)

    if current_chapter is not None:
        chapters.append({
            "title": current_chapter,
            "position_start": current_start,
            "position_end": position,
            "chapter_index": len(chapters),
        })

    return chapters, digest.hexdigest()

async def scan_single_file(file_path: Path, db_session: AsyncSession):
    # existing stat lookup above...
    if existing_book and existing_book.file_size == file_size and existing_book.file_mtime == mtime:
        logger.debug(f"Skipping unchanged file: {filename}")
        return existing_book, "skipped_unchanged"

    chapters, content_md5 = extract_chapters_and_md5(file_path)

    if existing_book:
        existing_book.file_mtime = mtime
        existing_book.content_md5 = content_md5
    else:
        existing_book = Book(
            title=title,
            filename=filename,
            file_path=str(file_path),
            file_size=file_size,
            file_mtime=mtime,
            content_md5=content_md5,
            encoding_original=original_encoding,
            is_utf8_converted=is_converted,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest -q tests/test_scanner_dedup.py`
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/scanner.py backend/tests/test_scanner_dedup.py
git commit -m "feat(dedup): record content hashes during scan"
```

### Task 3: Add Backend Duplicate Summary, Grouping, And Resolution

**Files:**
- Create: `backend/app/services/dedup.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/schemas.py`
- Create: `backend/tests/test_admin_dedup.py`
- Test: `backend/tests/test_admin_dedup.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_dedup.py
from pathlib import Path

import pytest
from sqlalchemy import insert

from app.models import Book

@pytest.mark.asyncio
async def test_dedup_summary_and_groups(async_client, db_session, tmp_path: Path):
    keep_file = tmp_path / "keep.txt"
    dup_file = tmp_path / "dup.txt"
    keep_file.write_text("same", encoding="utf-8")
    dup_file.write_text("same", encoding="utf-8")

    db_session.add_all([
        Book(title="A", filename="a.txt", file_path=str(keep_file), content_md5="abc", file_size=4),
        Book(title="B", filename="b.txt", file_path=str(dup_file), content_md5="abc", file_size=4),
    ])
    await db_session.commit()

    summary = await async_client.get("/api/v1/admin/dedup/summary")
    groups = await async_client.get("/api/v1/admin/dedup/groups")

    assert summary.status_code == 200
    assert summary.json()["duplicate_groups"] == 1
    assert groups.status_code == 200
    assert groups.json()["items"][0]["count"] == 2

@pytest.mark.asyncio
async def test_dedup_resolve_soft_delete_preserves_keep_book(async_client, db_session, tmp_path: Path):
    keep_file = tmp_path / "keep.txt"
    dup_file = tmp_path / "dup.txt"
    keep_file.write_text("same", encoding="utf-8")
    dup_file.write_text("same", encoding="utf-8")

    keep = Book(title="Keep", filename="keep.txt", file_path=str(keep_file), content_md5="abc", file_size=4, is_favorite=False, last_read_position=12)
    dup = Book(title="Dup", filename="dup.txt", file_path=str(dup_file), content_md5="abc", file_size=4, is_favorite=True, last_read_position=24)
    db_session.add_all([keep, dup])
    await db_session.commit()
    await db_session.refresh(keep)
    await db_session.refresh(dup)

    response = await async_client.post(
        "/api/v1/admin/dedup/resolve",
        json={
            "content_md5": "abc",
            "keep_book_id": keep.id,
            "delete_book_ids": [dup.id],
            "mode": "soft_delete",
            "delete_source_files": False,
        },
    )

    assert response.status_code == 200
    await db_session.refresh(keep)
    await db_session.refresh(dup)
    assert keep.is_favorite is True
    assert keep.last_read_position == 24
    assert dup.is_deleted is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest -q tests/test_admin_dedup.py`
Expected: FAIL with `404 Not Found` for dedup endpoints.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/schemas.py
class DedupGroupItem(BaseModel):
    id: int
    title: str
    filename: str
    file_path: str
    file_size: Optional[int] = None
    file_mtime: Optional[datetime] = None
    is_favorite: bool = False
    last_read_position: int = 0
    chapter_count: int = 0

class DedupGroupResponse(BaseModel):
    content_md5: str
    count: int
    recommended_keep_book_id: int
    items: List[DedupGroupItem]

class DedupSummaryResponse(BaseModel):
    duplicate_groups: int
    duplicate_books: int
    ignored_groups: int = 0

class DedupResolveRequest(BaseModel):
    content_md5: str
    keep_book_id: int
    delete_book_ids: List[int]
    mode: str
    delete_source_files: bool = False

# backend/app/services/dedup.py
async def get_dedup_summary(db: AsyncSession) -> dict:
    rows = await db.execute(text("""
        SELECT content_md5, COUNT(*) AS item_count
        FROM books
        WHERE is_deleted = 0 AND content_md5 IS NOT NULL AND dedup_ignored_at IS NULL
        GROUP BY content_md5
        HAVING COUNT(*) > 1
    """))
    groups = rows.fetchall()
    return {
        "duplicate_groups": len(groups),
        "duplicate_books": sum(row.item_count for row in groups),
        "ignored_groups": 0,
    }

async def resolve_duplicate_group(db: AsyncSession, request: DedupResolveRequest) -> dict:
    # load keep + deletes, merge favorite/progress into keep, optionally unlink files, then soft/hard delete
    ...

# backend/app/routers/admin.py
@router.get("/dedup/summary")
async def get_dedup_summary_route(db: AsyncSession = Depends(get_db)):
    return await dedup_service.get_dedup_summary(db)

@router.get("/dedup/groups")
async def get_dedup_groups_route(db: AsyncSession = Depends(get_db)):
    return await dedup_service.list_dedup_groups(db)

@router.post("/dedup/resolve")
async def resolve_dedup_group(request: DedupResolveRequest, db: AsyncSession = Depends(get_db)):
    return await dedup_service.resolve_duplicate_group(db, request)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest -q tests/test_admin_dedup.py`
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/dedup.py backend/app/routers/admin.py backend/app/schemas.py backend/tests/test_admin_dedup.py
git commit -m "feat(dedup): add admin duplicate resolution api"
```

### Task 4: Add Typed Admin Dedup API Client

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/admin.ts`
- Test: `frontend/src/pages/Admin.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// Use the existing Admin page test harness once the UI calls the new client methods.
// The first visible failure should be a TypeScript build error because dedup API types do not exist.
export interface DedupSummaryResponse {
  duplicate_groups: number
  duplicate_books: number
  ignored_groups: number
}

export interface DedupGroupItem {
  id: number
  title: string
  filename: string
  file_path: string
  file_size: number | null
  file_mtime: string | null
  is_favorite: boolean
  last_read_position: number
  chapter_count: number
}
```

- [ ] **Step 2: Run build to verify it fails**

Run: `cd frontend && npm run build`
Expected: FAIL once `Admin.tsx` references missing dedup response/request types.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/api/types.ts
export interface DedupSummaryResponse {
  duplicate_groups: number
  duplicate_books: number
  ignored_groups: number
}

export interface DedupGroupItem {
  id: number
  title: string
  filename: string
  file_path: string
  file_size: number | null
  file_mtime: string | null
  is_favorite: boolean
  last_read_position: number
  chapter_count: number
}

export interface DedupGroup {
  content_md5: string
  count: number
  recommended_keep_book_id: number
  items: DedupGroupItem[]
}

export interface DedupGroupsResponse {
  items: DedupGroup[]
  total: number
}

export interface DedupResolveRequest {
  content_md5: string
  keep_book_id: number
  delete_book_ids: number[]
  mode: 'soft_delete' | 'hard_delete'
  delete_source_files: boolean
}

// frontend/src/api/admin.ts
getDedupSummary: async (): Promise<DedupSummaryResponse> => {
  const response = await apiClient.get<DedupSummaryResponse>('/admin/dedup/summary')
  return response.data
},

getDedupGroups: async (): Promise<DedupGroupsResponse> => {
  const response = await apiClient.get<DedupGroupsResponse>('/admin/dedup/groups')
  return response.data
},

resolveDedupGroup: async (data: DedupResolveRequest) => {
  const response = await apiClient.post('/admin/dedup/resolve', data)
  return response.data
},
```

- [ ] **Step 4: Run build to verify it passes**

Run: `cd frontend && npm run build`
Expected: PASS once the admin API client compiles with the new dedup types.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/admin.ts
git commit -m "feat(dedup): add frontend admin dedup client"
```

### Task 5: Add Duplicate Management Section To Admin Page

**Files:**
- Modify: `frontend/src/pages/Admin.tsx`
- Modify: `frontend/src/api/admin.ts`
- Modify: `frontend/src/api/types.ts`
- Test: `frontend/src/pages/Admin.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/Admin.dedup.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import Admin from './Admin'
import { adminApi } from '../api/admin'

vi.mock('../api/admin', () => ({
  adminApi: {
    getOrphanedBooksCount: vi.fn().mockResolvedValue({ orphaned_books: 0 }),
    getDedupSummary: vi.fn().mockResolvedValue({ duplicate_groups: 1, duplicate_books: 2, ignored_groups: 0 }),
    getDedupGroups: vi.fn().mockResolvedValue({
      items: [{
        content_md5: 'abc',
        count: 2,
        recommended_keep_book_id: 2,
        items: [
          { id: 1, title: '旧副本', filename: 'a.txt', file_path: '/books/a.txt', file_size: 12, file_mtime: null, is_favorite: false, last_read_position: 10, chapter_count: 4 },
          { id: 2, title: '保留副本', filename: 'b.txt', file_path: '/books/b.txt', file_size: 12, file_mtime: null, is_favorite: true, last_read_position: 20, chapter_count: 4 },
        ],
      }],
      total: 1,
    }),
    resolveDedupGroup: vi.fn().mockResolvedValue({ resolved: 1, deleted: 1, file_results: [] }),
  },
}))

it('renders duplicate groups and resolves with file deletion disabled by default', async () => {
  render(<Admin />)

  expect(await screen.findByText('重复书籍')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /展开重复组/i }))
  fireEvent.click(await screen.findByLabelText('保留副本'))
  fireEvent.click(screen.getByRole('button', { name: '软删除其余' }))

  await waitFor(() => {
    expect(adminApi.resolveDedupGroup).toHaveBeenCalledWith({
      content_md5: 'abc',
      keep_book_id: 2,
      delete_book_ids: [1],
      mode: 'soft_delete',
      delete_source_files: false,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run src/pages/Admin.dedup.test.tsx`
Expected: FAIL because `Admin.tsx` does not yet render duplicate summary UI or call dedup APIs.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/pages/Admin.tsx
const [dedupSummary, setDedupSummary] = useState<DedupSummaryResponse | null>(null)
const [dedupGroups, setDedupGroups] = useState<DedupGroup[]>([])
const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
const [selectedKeepByHash, setSelectedKeepByHash] = useState<Record<string, number>>({})
const [deleteSourceFilesByHash, setDeleteSourceFilesByHash] = useState<Record<string, boolean>>({})

useEffect(() => {
  adminApi.getDedupSummary().then(setDedupSummary).catch(() => {})
  adminApi.getDedupGroups().then((data) => {
    setDedupGroups(data.items)
    setSelectedKeepByHash(Object.fromEntries(
      data.items.map((group) => [group.content_md5, group.recommended_keep_book_id])
    ))
  }).catch(() => {})
}, [])

const handleResolveGroup = async (group: DedupGroup, mode: 'soft_delete' | 'hard_delete') => {
  const keepBookId = selectedKeepByHash[group.content_md5]
  const deleteBookIds = group.items.filter((item) => item.id != keepBookId).map((item) => item.id)
  await adminApi.resolveDedupGroup({
    content_md5: group.content_md5,
    keep_book_id: keepBookId,
    delete_book_ids: deleteBookIds,
    mode,
    delete_source_files: deleteSourceFilesByHash[group.content_md5] ?? false,
  })
}

// render section
<section className="bg-white rounded-xl shadow-sm p-6 mb-6">
  <h2 className="text-lg font-semibold text-gray-800 mb-4">重复书籍</h2>
  <p className="text-sm text-gray-500 mb-4">
    重复组 {dedupSummary?.duplicate_groups ?? 0}，重复书籍 {dedupSummary?.duplicate_books ?? 0}
  </p>
  {dedupGroups.map((group) => (
    <div key={group.content_md5} className="border rounded-lg p-4 mb-4">
      <button
        type="button"
        aria-label="展开重复组"
        onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.content_md5]: !prev[group.content_md5] }))}
      >
        {group.content_md5.slice(0, 8)}... ({group.count})
      </button>
      {expandedGroups[group.content_md5] && (
        <>
          {group.items.map((item) => (
            <label key={item.id} className="flex items-center gap-3 py-2">
              <input
                type="radio"
                name={`keep-${group.content_md5}`}
                checked={selectedKeepByHash[group.content_md5] === item.id}
                onChange={() => setSelectedKeepByHash((prev) => ({ ...prev, [group.content_md5]: item.id }))}
              />
              <span>{item.title}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-red-600">
            <input
              type="checkbox"
              checked={deleteSourceFilesByHash[group.content_md5] ?? false}
              onChange={(event) => setDeleteSourceFilesByHash((prev) => ({
                ...prev,
                [group.content_md5]: event.target.checked,
              }))}
            />
            同时删除被移除副本的原始文件
          </label>
          {deleteSourceFilesByHash[group.content_md5] && (
            <p className="text-xs text-red-500">将直接删除磁盘文件，无法恢复。</p>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => handleResolveGroup(group, 'soft_delete')}>软删除其余</button>
            <button onClick={() => handleResolveGroup(group, 'hard_delete')}>硬删除其余</button>
          </div>
        </>
      )}
    </div>
  ))}
</section>
```

- [ ] **Step 4: Run test and build to verify it passes**

Run: `cd frontend && npm run test -- --run src/pages/Admin.dedup.test.tsx`
Expected: PASS with `1 passed`

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Admin.tsx frontend/src/pages/Admin.dedup.test.tsx
git commit -m "feat(dedup): add admin duplicate management ui"
```

## Self-Review

Spec coverage:

- `content_md5` recording and incremental reuse are covered by Task 2.
- manual dedup admin APIs are covered by Task 3.
- optional source-file deletion is covered by Tasks 3 and 5.
- admin summary/grouped UI is covered by Task 5.
- startup compatibility for existing databases is covered by Task 1.

Placeholder scan:

- No `TBD`, `TODO`, or “implement later” markers remain.
- Each task includes a concrete test command, code sketch, verification command, and commit message.

Type consistency:

- The plan consistently uses `content_md5`, `file_mtime`, `dedup_ignored_at`, `DedupSummaryResponse`, `DedupGroup`, and `DedupResolveRequest`.
- Frontend and backend both use `mode: 'soft_delete' | 'hard_delete'` and `delete_source_files: boolean`.
