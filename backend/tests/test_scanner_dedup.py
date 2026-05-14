import hashlib
from pathlib import Path

import pytest

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
async def test_scan_single_file_reuses_md5_for_unchanged_file(
    tmp_path: Path, db_session, monkeypatch
):
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
