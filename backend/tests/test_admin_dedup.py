from pathlib import Path
from datetime import datetime

import pytest
from sqlalchemy import select

from app.models import Book, ReadingProgress
from app.services import dedup as dedup_service

ADMIN_HEADERS = {"X-Admin-Key": "changeme"}


@pytest.mark.asyncio
async def test_dedup_summary_and_groups(async_client, db_session, tmp_path: Path):
    keep_file = tmp_path / "keep.txt"
    dup_file = tmp_path / "dup.txt"
    keep_file.write_text("same", encoding="utf-8")
    dup_file.write_text("same", encoding="utf-8")

    db_session.add_all(
        [
            Book(
                title="A",
                filename="a.txt",
                file_path=str(keep_file),
                content_md5="abc",
                file_size=4,
            ),
            Book(
                title="B",
                filename="b.txt",
                file_path=str(dup_file),
                content_md5="abc",
                file_size=4,
            ),
        ]
    )
    await db_session.commit()

    summary = await async_client.get("/api/v1/admin/dedup/summary", headers=ADMIN_HEADERS)
    groups = await async_client.get("/api/v1/admin/dedup/groups", headers=ADMIN_HEADERS)

    assert summary.status_code == 200
    assert summary.json()["duplicate_groups"] == 1
    assert groups.status_code == 200
    assert groups.json()["items"][0]["count"] == 2


@pytest.mark.asyncio
async def test_dedup_resolve_soft_delete_preserves_keep_book(
    async_client, db_session, tmp_path: Path
):
    keep_file = tmp_path / "keep.txt"
    dup_file = tmp_path / "dup.txt"
    keep_file.write_text("same", encoding="utf-8")
    dup_file.write_text("same", encoding="utf-8")

    keep = Book(
        title="Keep",
        filename="keep.txt",
        file_path=str(keep_file),
        content_md5="abc",
        file_size=4,
        is_favorite=False,
        last_read_position=12,
    )
    dup = Book(
        title="Dup",
        filename="dup.txt",
        file_path=str(dup_file),
        content_md5="abc",
        file_size=4,
        is_favorite=True,
        last_read_position=24,
    )
    db_session.add_all([keep, dup])
    await db_session.commit()
    await db_session.refresh(keep)
    await db_session.refresh(dup)

    response = await async_client.post(
        "/api/v1/admin/dedup/resolve",
        headers=ADMIN_HEADERS,
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


@pytest.mark.asyncio
async def test_dedup_summary_and_groups_exclude_ignored_books(
    async_client, db_session, tmp_path: Path
):
    keep_file = tmp_path / "keep.txt"
    dup_file = tmp_path / "dup.txt"
    ignored_file = tmp_path / "ignored.txt"
    keep_file.write_text("same", encoding="utf-8")
    dup_file.write_text("same", encoding="utf-8")
    ignored_file.write_text("same", encoding="utf-8")

    db_session.add_all(
        [
            Book(
                title="Keep",
                filename="keep-ignore-filter.txt",
                file_path=str(keep_file),
                content_md5="row-ignore",
                file_size=4,
            ),
            Book(
                title="Dup",
                filename="dup-ignore-filter.txt",
                file_path=str(dup_file),
                content_md5="row-ignore",
                file_size=4,
            ),
            Book(
                title="Ignored",
                filename="ignored-ignore-filter.txt",
                file_path=str(ignored_file),
                content_md5="row-ignore",
                file_size=4,
                dedup_ignored_at=datetime.utcnow(),
            ),
        ]
    )
    await db_session.commit()

    summary = await async_client.get("/api/v1/admin/dedup/summary", headers=ADMIN_HEADERS)
    groups = await async_client.get("/api/v1/admin/dedup/groups", headers=ADMIN_HEADERS)

    assert summary.status_code == 200
    assert summary.json()["duplicate_groups"] == 1
    assert summary.json()["duplicate_books"] == 2
    assert groups.status_code == 200
    assert groups.json()["items"][0]["content_md5"] == "row-ignore"
    assert groups.json()["items"][0]["count"] == 2
    assert [item["title"] for item in groups.json()["items"][0]["items"]] == ["Keep", "Dup"]


@pytest.mark.asyncio
async def test_dedup_resolve_allows_non_ignored_rows_in_duplicate_group(
    async_client, db_session, tmp_path: Path
):
    keep_file = tmp_path / "keep.txt"
    dup_file = tmp_path / "dup.txt"
    ignored_file = tmp_path / "ignored.txt"
    keep_file.write_text("same", encoding="utf-8")
    dup_file.write_text("same", encoding="utf-8")
    ignored_file.write_text("same", encoding="utf-8")

    keep = Book(
        title="Keep",
        filename="keep-ignore-resolve.txt",
        file_path=str(keep_file),
        content_md5="row-ignore-resolve",
        file_size=4,
        last_read_position=5,
    )
    dup = Book(
        title="Dup",
        filename="dup-ignore-resolve.txt",
        file_path=str(dup_file),
        content_md5="row-ignore-resolve",
        file_size=4,
        is_favorite=True,
        last_read_position=9,
    )
    ignored = Book(
        title="Ignored",
        filename="ignored-ignore-resolve.txt",
        file_path=str(ignored_file),
        content_md5="row-ignore-resolve",
        file_size=4,
        dedup_ignored_at=datetime.utcnow(),
    )
    db_session.add_all([keep, dup, ignored])
    await db_session.commit()
    await db_session.refresh(keep)
    await db_session.refresh(dup)
    await db_session.refresh(ignored)

    response = await async_client.post(
        "/api/v1/admin/dedup/resolve",
        headers=ADMIN_HEADERS,
        json={
            "content_md5": "row-ignore-resolve",
            "keep_book_id": keep.id,
            "delete_book_ids": [dup.id],
            "mode": "soft_delete",
            "delete_source_files": False,
        },
    )

    assert response.status_code == 200
    await db_session.refresh(keep)
    await db_session.refresh(dup)
    await db_session.refresh(ignored)
    assert keep.is_favorite is True
    assert keep.last_read_position == 9
    assert dup.is_deleted is True
    assert ignored.is_deleted is False


@pytest.mark.asyncio
async def test_dedup_resolve_hard_delete_merges_device_progress_and_deletes_file(
    async_client, db_session, tmp_path: Path
):
    keep_file = tmp_path / "keep-hard.txt"
    dup_file = tmp_path / "dup-hard.txt"
    keep_file.write_text("same", encoding="utf-8")
    dup_file.write_text("same", encoding="utf-8")

    keep = Book(
        title="Keep",
        filename="keep-hard.txt",
        file_path=str(keep_file),
        content_md5="hard-delete",
        file_size=4,
        last_read_position=10,
    )
    dup = Book(
        title="Dup",
        filename="dup-hard.txt",
        file_path=str(dup_file),
        content_md5="hard-delete",
        file_size=4,
        is_favorite=True,
        last_read_position=20,
    )
    db_session.add_all([keep, dup])
    await db_session.commit()
    await db_session.refresh(keep)
    await db_session.refresh(dup)

    db_session.add_all(
        [
            ReadingProgress(
                book_id=keep.id,
                device_id="kindle",
                current_position=10,
                current_chapter="chapter-1",
                reading_settings={"theme": "light"},
            ),
            ReadingProgress(
                book_id=dup.id,
                device_id="kindle",
                current_position=25,
                current_chapter="chapter-2",
                reading_settings={"theme": "dark"},
            ),
            ReadingProgress(
                book_id=dup.id,
                device_id="phone",
                current_position=30,
                current_chapter="chapter-3",
                reading_settings={"font_size": 22},
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/admin/dedup/resolve",
        headers=ADMIN_HEADERS,
        json={
            "content_md5": "hard-delete",
            "keep_book_id": keep.id,
            "delete_book_ids": [dup.id],
            "mode": "hard_delete",
            "delete_source_files": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "hard_delete"
    assert payload["file_results"] == [
        {
            "book_id": dup.id,
            "file_path": str(dup_file),
            "deleted": True,
            "reason": None,
        }
    ]

    await db_session.refresh(keep)
    assert keep.is_favorite is True
    assert keep.last_read_position == 30
    assert keep.last_read_chapter == "chapter-3"
    assert dup_file.exists() is False

    progress_result = await db_session.execute(
        select(ReadingProgress)
        .where(ReadingProgress.book_id == keep.id)
        .order_by(ReadingProgress.device_id.asc())
    )
    progress_rows = list(progress_result.scalars().all())
    assert len(progress_rows) == 2
    assert progress_rows[0].device_id == "kindle"
    assert progress_rows[0].current_position == 25
    assert progress_rows[0].current_chapter == "chapter-2"
    assert progress_rows[0].reading_settings == {"theme": "dark"}
    assert progress_rows[1].device_id == "phone"
    assert progress_rows[1].current_position == 30
    assert progress_rows[1].current_chapter == "chapter-3"

    deleted_book = await db_session.execute(select(Book).where(Book.id == dup.id))
    assert deleted_book.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_dedup_resolve_returns_file_result_when_exists_check_fails(
    async_client, db_session, tmp_path: Path, monkeypatch
):
    keep_file = tmp_path / "keep-fs.txt"
    dup_file = tmp_path / "dup-fs.txt"
    keep_file.write_text("same", encoding="utf-8")
    dup_file.write_text("same", encoding="utf-8")

    keep = Book(
        title="Keep",
        filename="keep-fs.txt",
        file_path=str(keep_file),
        content_md5="fs-error",
        file_size=4,
    )
    dup = Book(
        title="Dup",
        filename="dup-fs.txt",
        file_path=str(dup_file),
        content_md5="fs-error",
        file_size=4,
    )
    db_session.add_all([keep, dup])
    await db_session.commit()
    await db_session.refresh(keep)
    await db_session.refresh(dup)

    original_exists = dedup_service.Path.exists

    def failing_exists(path_obj: Path) -> bool:
        if path_obj == dup_file:
            raise OSError("exists boom")
        return original_exists(path_obj)

    monkeypatch.setattr(dedup_service.Path, "exists", failing_exists)

    response = await async_client.post(
        "/api/v1/admin/dedup/resolve",
        headers=ADMIN_HEADERS,
        json={
            "content_md5": "fs-error",
            "keep_book_id": keep.id,
            "delete_book_ids": [dup.id],
            "mode": "soft_delete",
            "delete_source_files": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["file_results"] == [
        {
            "book_id": dup.id,
            "file_path": str(dup_file),
            "deleted": False,
            "reason": "exists boom",
        }
    ]

    await db_session.refresh(keep)
    await db_session.refresh(dup)
    assert dup.is_deleted is True
    assert original_exists(dup_file) is True
