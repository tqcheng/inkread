import hashlib
import os
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

import pytest

from app.services.scanner import find_archives, prepare_archives, scan_library, scan_single_file
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


def test_find_archives_includes_zip_and_rar_but_excludes_backups(tmp_path: Path):
    included_zip = tmp_path / "included.zip"
    included_rar = tmp_path / "nested" / "included.rar"
    excluded_zip_backup = tmp_path / "excluded.zip.bak"
    excluded_rar_backup = tmp_path / "nested" / "excluded.rar.bak"
    excluded_uppercase_backup = tmp_path / "uppercase.BAK.zip"
    ignored_txt = tmp_path / "ignored.txt"

    included_zip.write_bytes(b"zip")
    included_rar.parent.mkdir()
    included_rar.write_bytes(b"rar")
    excluded_zip_backup.write_bytes(b"zip backup")
    excluded_rar_backup.write_bytes(b"rar backup")
    excluded_uppercase_backup.write_bytes(b"uppercase backup")
    ignored_txt.write_text("ignored", encoding="utf-8")

    assert find_archives(tmp_path) == [included_zip, included_rar]


@pytest.mark.asyncio
async def test_prepare_archives_skips_existing_target_directory(tmp_path: Path):
    archive_path = tmp_path / "series.zip"
    archive_path.write_bytes(b"zip")
    archive_path.with_suffix("").mkdir()

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_skipped_target_exists"}
    ]


@pytest.mark.asyncio
async def test_prepare_archives_skips_existing_backup(tmp_path: Path):
    archive_path = tmp_path / "series.rar"
    archive_path.write_bytes(b"rar")
    archive_path.with_suffix(".rar.bak").write_bytes(b"backup")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_skipped_backup_exists"}
    ]


@pytest.mark.asyncio
async def test_prepare_archives_reports_rar_as_unsupported(tmp_path: Path):
    archive_path = tmp_path / "pending.rar"
    archive_path.write_bytes(b"rar")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_error_rar_unsupported"}
    ]


@pytest.mark.asyncio
async def test_prepare_archives_reports_existing_target_file_conflict(tmp_path: Path):
    archive_path = tmp_path / "series.zip"
    archive_path.write_bytes(b"zip")
    archive_path.with_suffix("").write_text("conflict", encoding="utf-8")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_skipped_target_conflict"}
    ]


@pytest.mark.asyncio
async def test_prepare_archives_extracts_zip_to_same_name_folder_and_backs_up_source(
    tmp_path: Path,
):
    archive_path = tmp_path / "series.zip"
    extracted_dir = archive_path.with_suffix("")
    backup_path = archive_path.with_suffix(".zip.bak")

    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("chapter1.txt", "第一章\n\n正文\n")
        archive.writestr("nested/chapter2.txt", "第二章\n\n正文\n")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_extracted_zip"}
    ]
    assert extracted_dir.is_dir()
    assert (extracted_dir / "chapter1.txt").read_text(encoding="utf-8") == "第一章\n\n正文\n"
    assert (extracted_dir / "nested" / "chapter2.txt").read_text(encoding="utf-8") == "第二章\n\n正文\n"
    assert backup_path.is_file()
    assert archive_path.exists() is False


@pytest.mark.asyncio
async def test_prepare_archives_rejects_unsafe_zip_member_path(tmp_path: Path):
    archive_path = tmp_path / "unsafe.zip"
    extracted_dir = archive_path.with_suffix("")
    backup_path = archive_path.with_suffix(".zip.bak")
    escaped_path = tmp_path / "escaped.txt"

    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("../escaped.txt", "nope")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_error_unsafe_path"}
    ]
    assert extracted_dir.exists() is False
    assert backup_path.exists() is False
    assert archive_path.is_file()
    assert escaped_path.exists() is False


@pytest.mark.asyncio
async def test_prepare_archives_reports_corrupt_zip_without_stopping(tmp_path: Path):
    corrupt_archive = tmp_path / "broken.zip"
    valid_archive = tmp_path / "good.zip"

    corrupt_archive.write_bytes(b"not a zip")
    with zipfile.ZipFile(valid_archive, "w") as archive:
        archive.writestr("chapter.txt", "第一章\n\n正文\n")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": corrupt_archive, "status": "archive_error_bad_zip"},
        {"archive_path": valid_archive, "status": "archive_extracted_zip"},
    ]
    assert valid_archive.with_suffix("").is_dir()
    assert valid_archive.with_suffix(".zip.bak").is_file()
    assert corrupt_archive.is_file()
    assert corrupt_archive.with_suffix("").exists() is False


@pytest.mark.asyncio
async def test_prepare_archives_cleans_published_target_when_backup_rename_fails(
    tmp_path: Path, monkeypatch
):
    archive_path = tmp_path / "series.zip"
    target_dir = archive_path.with_suffix("")
    backup_path = archive_path.with_suffix(".zip.bak")

    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("chapter.txt", "第一章\n\n正文\n")

    original_rename = Path.rename

    def failing_rename(self: Path, target):
        if self == archive_path and Path(target) == backup_path:
            raise OSError("backup rename failed")
        return original_rename(self, target)

    monkeypatch.setattr(Path, "rename", failing_rename)

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_error_filesystem"}
    ]
    assert target_dir.exists() is False
    assert backup_path.exists() is False
    assert archive_path.is_file()


@pytest.mark.asyncio
async def test_prepare_archives_continues_after_unexpected_zip_error(
    tmp_path: Path, monkeypatch
):
    broken_archive = tmp_path / "broken.zip"
    valid_archive = tmp_path / "good.zip"

    with zipfile.ZipFile(broken_archive, "w") as archive:
        archive.writestr("chapter.txt", "第一章\n\n正文\n")
    with zipfile.ZipFile(valid_archive, "w") as archive:
        archive.writestr("chapter.txt", "第二章\n\n正文\n")

    import shutil as shutil_module

    original_copy = shutil_module.copyfileobj
    original_mkdtemp = tempfile.mkdtemp
    broken_temp_dir = broken_archive.parent / "broken.fail.tmp"

    def fake_mkdtemp(prefix: str, suffix: str, dir: str):
        if prefix.startswith("broken."):
            broken_temp_dir.mkdir()
            return str(broken_temp_dir)
        return original_mkdtemp(prefix=prefix, suffix=suffix, dir=dir)

    def failing_copy(source, output, length=0):
        if getattr(output, "name", "") == str(broken_temp_dir / "chapter.txt"):
            raise OSError("disk full")
        return original_copy(source, output, length)

    monkeypatch.setattr(tempfile, "mkdtemp", fake_mkdtemp)
    monkeypatch.setattr(shutil_module, "copyfileobj", failing_copy)

    assert await prepare_archives(tmp_path) == [
        {"archive_path": broken_archive, "status": "archive_error_filesystem"},
        {"archive_path": valid_archive, "status": "archive_extracted_zip"},
    ]
    assert broken_archive.is_file()
    assert broken_archive.with_suffix("").exists() is False
    assert valid_archive.with_suffix("").is_dir()
    assert valid_archive.with_suffix(".zip.bak").is_file()


def _write_legacy_named_zip(zip_path, filename, content, encoding="gbk"):
    """Write a zip entry where the filename is legacy-encoded but stored via cp437."""
    filename_bytes = filename.encode(encoding)
    cp437_filename = filename_bytes.decode("cp437")

    original_encode = zipfile.ZipInfo._encodeFilenameFlags

    def _patched_encode(self):
        try:
            return self.filename.encode("cp437"), self.flag_bits
        except UnicodeEncodeError:
            return original_encode(self)

    zipfile.ZipInfo._encodeFilenameFlags = _patched_encode
    try:
        with zipfile.ZipFile(zip_path, "w") as archive:
            info = zipfile.ZipInfo(filename=cp437_filename)
            info.flag_bits &= ~0x800  # Clear UTF-8 flag
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    finally:
        zipfile.ZipInfo._encodeFilenameFlags = original_encode


@pytest.mark.asyncio
async def test_prepare_archives_restores_legacy_chinese_zip_member_name(
    tmp_path: Path,
):
    archive_path = tmp_path / "legacy.zip"
    extracted_dir = archive_path.with_suffix("")
    backup_path = archive_path.with_suffix(".zip.bak")

    chinese_name = "第一章.txt"
    content = "第一章\n\n正文\n"
    _write_legacy_named_zip(archive_path, chinese_name, content, encoding="gbk")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_extracted_zip"}
    ]
    assert extracted_dir.is_dir()
    assert (extracted_dir / chinese_name).read_text(encoding="utf-8") == content
    assert backup_path.is_file()
    assert archive_path.exists() is False


@pytest.mark.asyncio
async def test_prepare_archives_continues_after_tempdir_creation_error(
    tmp_path: Path, monkeypatch
):
    broken_archive = tmp_path / "broken.zip"
    valid_archive = tmp_path / "good.zip"

    with zipfile.ZipFile(broken_archive, "w") as archive:
        archive.writestr("chapter.txt", "第一章\n\n正文\n")
    with zipfile.ZipFile(valid_archive, "w") as archive:
        archive.writestr("chapter.txt", "第二章\n\n正文\n")

    original_mkdtemp = tempfile.mkdtemp

    def failing_mkdtemp(prefix: str, suffix: str, dir: str):
        if prefix.startswith("broken."):
            raise OSError("no space left")
        return original_mkdtemp(prefix=prefix, suffix=suffix, dir=dir)

    monkeypatch.setattr(tempfile, "mkdtemp", failing_mkdtemp)

    assert await prepare_archives(tmp_path) == [
        {"archive_path": broken_archive, "status": "archive_error_filesystem"},
        {"archive_path": valid_archive, "status": "archive_extracted_zip"},
    ]
    assert broken_archive.is_file()
    assert broken_archive.with_suffix("").exists() is False
    assert valid_archive.with_suffix("").is_dir()
    assert valid_archive.with_suffix(".zip.bak").is_file()


@pytest.mark.asyncio
async def test_scan_library_extracts_zip_then_scans_txt(tmp_path: Path, session_factory):
    archive_path = tmp_path / "series.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("chapter1.txt", "第一章\n\n正文内容\n")

    stats = await scan_library(tmp_path, session_factory)

    assert stats["archives_found"] == 1
    assert stats["archives_extracted"] == 1
    assert stats["archives_skipped"] == 0
    assert stats["archive_errors"] == 0
    assert stats["total_files"] == 1
    assert stats["scanned"] == 1
    assert stats["new_books"] == 1

    backup_path = archive_path.with_suffix(".zip.bak")
    assert backup_path.is_file()
    assert archive_path.exists() is False

    extracted_txt = tmp_path / "series" / "chapter1.txt"
    assert extracted_txt.is_file()

    assert any("archive_extracted" in d["status"] for d in stats["archive_details"])


@pytest.mark.asyncio
async def test_scan_library_ignores_zip_backups(tmp_path: Path, session_factory):
    backup_path = tmp_path / "series.zip.bak"
    with zipfile.ZipFile(backup_path, "w") as archive:
        archive.writestr("chapter1.txt", "第一章\n\n正文内容\n")

    stats = await scan_library(tmp_path, session_factory)

    assert stats["archives_found"] == 0
    assert stats["total_files"] == 0


@pytest.mark.asyncio
async def test_scan_library_reports_unsupported_rar_and_continues_scanning_txt(tmp_path: Path, session_factory):
    from app.services.scanner import scan_library

    rar_path = tmp_path / "packed.rar"
    rar_path.write_bytes(b"not really rar")
    (tmp_path / "plain.txt").write_text("第一章 普通书\n正文", encoding="utf-8")

    stats = await scan_library(tmp_path, session_factory)

    assert stats["archives_found"] == 1
    assert stats["archive_errors"] == 1
    assert any(d["status"] == "archive_error_rar_unsupported" for d in stats["archive_details"])
    assert rar_path.exists()
    assert not rar_path.with_suffix(".rar.bak").exists()
    assert stats["total_files"] == 1
    assert stats["scanned"] == 1
    assert stats["new_books"] == 1
