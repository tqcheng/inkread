from pathlib import Path

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
