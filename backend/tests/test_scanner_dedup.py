import hashlib
import os
from datetime import datetime
from pathlib import Path

import pytest

from app.services.scanner import scan_single_file
from app.services.encoding import convert_to_utf8


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

    original_extract = services.scanner.extract_chapters_and_md5

    def wrapped_extract(path):
        calls["count"] += 1
        return original_extract(path)

    monkeypatch.setattr(services.scanner, "extract_chapters_and_md5", wrapped_extract)
    rescanned, message = await scan_single_file(file_path, db_session)

    assert message == "skipped_unchanged"
    assert rescanned.content_md5 == original.content_md5
    assert calls["count"] == 0


@pytest.mark.asyncio
async def test_scan_single_file_rescans_same_size_file_when_mtime_changes(
    tmp_path: Path, db_session, monkeypatch
):
    file_path = tmp_path / "beta_same_size.txt"
    original_content = "第一章 A\n\n正文X\n"
    updated_content = "第一章 B\n\n正文Y\n"
    assert len(original_content.encode("utf-8")) == len(updated_content.encode("utf-8"))

    file_path.write_text(original_content, encoding="utf-8")
    original_book, _ = await scan_single_file(file_path, db_session)
    await db_session.refresh(original_book)

    original_md5 = original_book.content_md5
    original_size = original_book.file_size
    original_mtime = original_book.file_mtime

    file_path.write_text(updated_content, encoding="utf-8")
    assert file_path.stat().st_size == original_size

    next_timestamp = file_path.stat().st_mtime + 5
    os.utime(file_path, (next_timestamp, next_timestamp))

    calls = {"count": 0}

    from app import services

    original_extract = services.scanner.extract_chapters_and_md5

    def wrapped_extract(path):
        calls["count"] += 1
        return original_extract(path)

    monkeypatch.setattr(services.scanner, "extract_chapters_and_md5", wrapped_extract)
    rescanned, message = await scan_single_file(file_path, db_session)

    await db_session.refresh(rescanned)
    assert message != "skipped_unchanged"
    assert calls["count"] == 1
    assert rescanned.content_md5 == hashlib.md5(updated_content.encode("utf-8")).hexdigest()
    assert rescanned.content_md5 != original_md5
    assert rescanned.file_size == original_size
    assert rescanned.file_mtime != original_mtime


@pytest.mark.asyncio
async def test_scan_single_file_uses_original_bytes_md5_for_converted_file(
    tmp_path: Path, db_session, monkeypatch
):
    file_path = tmp_path / "gamma.txt"
    raw_content = "第一章 开始\n\n正文内容\n".encode("gbk")
    file_path.write_bytes(raw_content)

    async def fake_detect_encoding(_file_path):
        return "GBK", 1.0

    from app import services
    from app.services import encoding as encoding_service

    monkeypatch.setattr(services.scanner, "detect_encoding", fake_detect_encoding)
    monkeypatch.setattr(encoding_service, "detect_encoding", fake_detect_encoding)

    book, message = await scan_single_file(file_path, db_session)

    await db_session.refresh(book)
    current_stat = file_path.stat()

    assert message.startswith("created")
    assert book.content_md5 == hashlib.md5(raw_content).hexdigest()
    assert book.file_size == current_stat.st_size
    assert book.file_mtime == datetime.fromtimestamp(current_stat.st_mtime)


@pytest.mark.asyncio
async def test_convert_to_utf8_prefers_chinese_encoding_over_cp1252_mojibake(
    tmp_path: Path, monkeypatch
):
    file_path = tmp_path / "xianlu.txt"
    content = "第一章 仙路美人图\n她说：你好，修仙路远。\n"
    file_path.write_bytes(content.encode("gb18030"))

    async def fake_detect_encoding(_file_path):
        return "cp1252", 0.95

    from app.services import encoding as encoding_service

    monkeypatch.setattr(encoding_service, "detect_encoding", fake_detect_encoding)

    converted, message, _original_md5 = await convert_to_utf8(file_path)

    assert converted is True
    assert "GB18030" in message
    assert file_path.read_text(encoding="utf-8") == content
