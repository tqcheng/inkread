from pathlib import Path
from datetime import datetime

import pytest

from app.models import Book

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
