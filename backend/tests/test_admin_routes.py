"""Integration tests for admin routes without admin-key protection."""

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.models import AiCache, Book, Chapter, ReadingProgress, Settings


@pytest.mark.asyncio
async def test_batch_delete_without_admin_key_soft_deletes_db_rows_only(
    async_client: AsyncClient, db_session, tmp_path
):
    """Batch delete should work without a key and keep source files on disk."""
    books = []
    for index in range(2):
        book_path = tmp_path / f"delete-me-{index}.txt"
        book_path.write_text(f"content {index}", encoding="utf-8")
        book = Book(
            title=f"书籍{index}",
            filename=book_path.name,
            file_path=str(book_path),
        )
        db_session.add(book)
        books.append(book)

    await db_session.commit()

    response = await async_client.post(
        "/api/v1/admin/batch-delete",
        json={"ids": [book.id for book in books]},
    )

    assert response.status_code == 200
    assert response.json() == {
        "deleted": 2,
        "kept": 0,
        "delete_source_files": False,
        "file_results": [],
    }

    result = await db_session.execute(
        select(Book).where(Book.id.in_([book.id for book in books]))
    )
    deleted_books = result.scalars().all()
    assert len(deleted_books) == 2
    assert all(book.is_deleted is True for book in deleted_books)
    assert all((tmp_path / f"delete-me-{index}.txt").exists() for index in range(2))


@pytest.mark.asyncio
async def test_reset_without_admin_key_clears_db_tables_only(
    async_client: AsyncClient, db_session, tmp_path
):
    """Reset should clear persisted rows without deleting source files."""
    book_path = tmp_path / "reset-me.txt"
    book_path.write_text("reset content", encoding="utf-8")

    book = Book(
        title="待重置书籍",
        filename=book_path.name,
        file_path=str(book_path),
    )
    db_session.add(book)
    await db_session.flush()

    db_session.add(
        Chapter(
            book_id=book.id,
            title="第一章",
            position_start=0,
            position_end=10,
            chapter_index=0,
        )
    )
    db_session.add(
        ReadingProgress(
            book_id=book.id,
            device_id="test-device",
            current_position=10,
            current_chapter="第一章",
        )
    )
    db_session.add(Settings(key="theme", value="light"))
    db_session.add(AiCache(file_hash="a" * 32, category="wuxia", tags=["tag"]))
    await db_session.commit()

    response = await async_client.post("/api/v1/admin/reset")

    assert response.status_code == 200
    assert response.json()["success"] is True

    book_count = await db_session.scalar(select(func.count()).select_from(Book))
    chapter_count = await db_session.scalar(select(func.count()).select_from(Chapter))
    progress_count = await db_session.scalar(
        select(func.count()).select_from(ReadingProgress)
    )
    settings_count = await db_session.scalar(select(func.count()).select_from(Settings))
    cache_count = await db_session.scalar(select(func.count()).select_from(AiCache))

    assert book_count == 0
    assert chapter_count == 0
    assert progress_count == 0
    assert settings_count == 0
    assert cache_count == 0
    assert book_path.exists()


@pytest.mark.asyncio
async def test_non_admin_endpoint_returns_book_list(async_client: AsyncClient):
    """Non-admin endpoints still work without a key."""
    response = await async_client.get("/api/v1/books/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_batch_delete_missing_books_returns_not_found(async_client: AsyncClient):
    """Missing books should still return 404 instead of an auth failure."""
    response = await async_client.post(
        "/api/v1/admin/batch-delete",
        json={"ids": [99999]},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_batch_delete_with_mixed_valid_and_missing_ids_returns_not_found(
    async_client: AsyncClient, db_session, tmp_path
):
    book_path = tmp_path / "keep-me.txt"
    book_path.write_text("content", encoding="utf-8")

    book = Book(
        title="保留书籍",
        filename=book_path.name,
        file_path=str(book_path),
    )
    db_session.add(book)
    await db_session.commit()
    await db_session.refresh(book)

    response = await async_client.post(
        "/api/v1/admin/batch-delete",
        json={"ids": [book.id, 99999]},
    )

    assert response.status_code == 404

    result = await db_session.execute(select(Book).where(Book.id == book.id))
    updated_book = result.scalar_one()
    assert updated_book.is_deleted is False
    assert book_path.exists()


@pytest.mark.asyncio
async def test_batch_delete_with_source_files_only_deletes_db_rows_after_file_removal(
    async_client: AsyncClient, db_session, tmp_path
):
    book_path = tmp_path / "remove-me.txt"
    book_path.write_text("content", encoding="utf-8")

    book = Book(
        title="待删源文件",
        filename=book_path.name,
        file_path=str(book_path),
    )
    db_session.add(book)
    await db_session.commit()
    await db_session.refresh(book)

    response = await async_client.post(
        "/api/v1/admin/batch-delete",
        json={"ids": [book.id], "delete_source_files": True},
    )

    assert response.status_code == 200
    assert response.json()["deleted"] == 1
    assert response.json()["kept"] == 0
    assert response.json()["delete_source_files"] is True
    assert response.json()["file_results"] == [
        {
            "book_id": book.id,
            "file_path": str(book_path),
            "deleted": True,
            "reason": None,
        }
    ]

    result = await db_session.execute(select(Book).where(Book.id == book.id))
    updated_book = result.scalar_one()
    assert updated_book.is_deleted is True
    assert not book_path.exists()


@pytest.mark.asyncio
async def test_batch_delete_with_source_files_restores_staged_files_when_commit_fails(
    async_client: AsyncClient, db_session, session_factory, tmp_path, monkeypatch
):
    book_path = tmp_path / "restore-me.txt"
    book_path.write_text("content", encoding="utf-8")

    book = Book(
        title="恢复书籍",
        filename=book_path.name,
        file_path=str(book_path),
    )
    db_session.add(book)
    await db_session.commit()
    await db_session.refresh(book)
    book_id = book.id

    async def fail_commit():
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db_session, "commit", fail_commit)

    with pytest.raises(RuntimeError, match="commit failed"):
        await async_client.post(
            "/api/v1/admin/batch-delete",
            json={"ids": [book_id], "delete_source_files": True},
        )

    assert book_path.exists()

    async with session_factory() as verify_session:
        result = await verify_session.execute(select(Book).where(Book.id == book_id))
        updated_book = result.scalar_one()
        assert updated_book.is_deleted is False


@pytest.mark.asyncio
async def test_batch_delete_with_source_files_keeps_books_when_file_deletion_fails(
    async_client: AsyncClient, db_session, tmp_path
):
    missing_path = tmp_path / "missing.txt"

    book = Book(
        title="保留书籍",
        filename=missing_path.name,
        file_path=str(missing_path),
    )
    db_session.add(book)
    await db_session.commit()
    await db_session.refresh(book)

    response = await async_client.post(
        "/api/v1/admin/batch-delete",
        json={"ids": [book.id], "delete_source_files": True},
    )

    assert response.status_code == 200
    assert response.json()["deleted"] == 0
    assert response.json()["kept"] == 1
    assert response.json()["file_results"] == [
        {
            "book_id": book.id,
            "file_path": str(missing_path),
            "deleted": False,
            "reason": "source file not found",
        }
    ]

    result = await db_session.execute(select(Book).where(Book.id == book.id))
    updated_book = result.scalar_one()
    assert updated_book.is_deleted is False


@pytest.mark.asyncio
async def test_metadata_update_without_admin_key_is_allowed(
    async_client: AsyncClient, db_session, tmp_path
):
    """Metadata updates should no longer require a key."""
    book_path = tmp_path / "metadata-book.txt"
    book_path.write_text("metadata", encoding="utf-8")

    book = Book(
        title="待编辑书籍",
        filename=book_path.name,
        file_path=str(book_path),
        category="old",
        tags=["legacy"],
    )
    db_session.add(book)
    await db_session.commit()

    response = await async_client.put(
        f"/api/v1/admin/metadata/{book.id}",
        json={"category": "wuxia", "tags": ["updated"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["category"] == "wuxia"
    assert payload["tags"] == ["updated"]
    assert payload["tags_source"] == "manual"


@pytest.mark.asyncio
async def test_validate_endpoint_is_removed(async_client: AsyncClient):
    """The dedicated admin-key validation endpoint should not exist anymore."""
    response = await async_client.get("/api/v1/admin/validate")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
