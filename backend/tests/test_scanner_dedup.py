import hashlib
import os
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import Book
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
async def test_scan_single_file_uses_converted_file_md5_and_backs_up_original(
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
    # content_md5 is MD5 of the converted (UTF-8) file, not the original bytes
    utf8_content = file_path.read_bytes()
    assert book.content_md5 == hashlib.md5(utf8_content).hexdigest()
    assert book.content_md5 != hashlib.md5(raw_content).hexdigest()
    # Original backup moved to bak/ by scan_single_file after conversion
    assert (tmp_path / "bak" / "gamma.txt.bak").read_bytes() == raw_content
    assert book.file_size == current_stat.st_size
    assert book.file_mtime == datetime.fromtimestamp(current_stat.st_mtime)


@pytest.mark.asyncio
async def test_scan_library_keeps_books_with_same_filename_in_different_dirs(
    tmp_path: Path, session_factory
):
    first_dir = tmp_path / "vol1"
    second_dir = tmp_path / "vol2"
    first_dir.mkdir()
    second_dir.mkdir()

    first_path = first_dir / "chapter.txt"
    second_path = second_dir / "chapter.txt"
    first_path.write_text("第一章 卷一\n\n正文\n", encoding="utf-8")
    second_path.write_text("第一章 卷二\n\n正文\n", encoding="utf-8")

    stats = await scan_library(tmp_path, session_factory)

    async with session_factory() as session:
        result = await session.execute(select(Book).order_by(Book.file_path.asc()))
        books = result.scalars().all()

    assert stats["new_books"] == 2
    assert len(books) == 2
    assert [book.file_path for book in books] == [str(first_path), str(second_path)]


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
    excluded_bak_dir_zip = tmp_path / "bak" / "moved.zip"
    ignored_txt = tmp_path / "ignored.txt"

    included_zip.write_bytes(b"zip")
    included_rar.parent.mkdir()
    included_rar.write_bytes(b"rar")
    excluded_zip_backup.write_bytes(b"zip backup")
    excluded_rar_backup.write_bytes(b"rar backup")
    excluded_uppercase_backup.write_bytes(b"uppercase backup")
    excluded_bak_dir_zip.parent.mkdir()
    excluded_bak_dir_zip.write_bytes(b"already moved")
    ignored_txt.write_text("ignored", encoding="utf-8")

    assert find_archives(tmp_path) == [included_zip, included_rar]


@pytest.mark.asyncio
async def test_prepare_archives_skips_existing_extracted_file_conflict(tmp_path: Path):
    archive_path = tmp_path / "series.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("chapter.txt", "第一章\n\n正文\n")
    (tmp_path / "chapter.txt").write_text("conflict", encoding="utf-8")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_skipped_target_conflict"}
    ]


@pytest.mark.asyncio
async def test_prepare_archives_skips_existing_backup(tmp_path: Path):
    archive_path = tmp_path / "series.rar"
    archive_path.write_bytes(b"rar")
    bak_dir = tmp_path / "bak"
    bak_dir.mkdir()
    (bak_dir / "series.rar").write_bytes(b"backup")

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
async def test_prepare_archives_reports_existing_extracted_directory_conflict(tmp_path: Path):
    archive_path = tmp_path / "series.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("nested/chapter.txt", "第一章\n\n正文\n")
    (tmp_path / "chapter.txt").mkdir()

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_skipped_target_conflict"}
    ]


@pytest.mark.asyncio
async def test_prepare_archives_extracts_zip_to_archive_directory_and_backs_up_source(
    tmp_path: Path,
):
    archive_path = tmp_path / "series.zip"
    backup_path = tmp_path / "bak" / "series.zip"

    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("chapter1.txt", "第一章\n\n正文\n")
        archive.writestr("nested/chapter2.txt", "第二章\n\n正文\n")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_extracted_zip"}
    ]
    assert (tmp_path / "chapter1.txt").read_text(encoding="utf-8") == "第一章\n\n正文\n"
    assert (tmp_path / "chapter2.txt").read_text(encoding="utf-8") == "第二章\n\n正文\n"
    assert backup_path.is_file()
    assert archive_path.exists() is False


@pytest.mark.asyncio
async def test_prepare_archives_rejects_unsafe_zip_member_path(tmp_path: Path):
    archive_path = tmp_path / "unsafe.zip"
    backup_path = tmp_path / "bak" / "unsafe.zip"
    escaped_path = tmp_path / "escaped.txt"

    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("../escaped.txt", "nope")

    results = await prepare_archives(tmp_path)
    # Flattening neutralises path traversal (../escaped.txt → escaped.txt)
    assert len(results) == 1 and results[0]["status"] == "archive_extracted_zip"
    # The file ends up safely inside the archive directory root
    assert escaped_path.read_text(encoding="utf-8") == "nope"
    assert backup_path.is_file()


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
    assert (tmp_path / "chapter.txt").is_file()
    assert (tmp_path / "bak" / "good.zip").is_file()
    assert corrupt_archive.is_file()
    assert corrupt_archive.with_suffix("").exists() is False


@pytest.mark.asyncio
async def test_prepare_archives_cleans_published_target_when_backup_rename_fails(
    tmp_path: Path, monkeypatch
):
    archive_path = tmp_path / "series.zip"
    extracted_txt = tmp_path / "chapter.txt"
    backup_path = tmp_path / "bak" / "series.zip"

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
    assert extracted_txt.exists() is False
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
    assert (tmp_path / "chapter.txt").is_file()
    assert (tmp_path / "bak" / "good.zip").is_file()


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
    backup_path = tmp_path / "bak" / "legacy.zip"
    chinese_name = "第一章.txt"
    content = "第一章\n\n正文\n"
    _write_legacy_named_zip(archive_path, chinese_name, content, encoding="gbk")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_extracted_zip"}
    ]
    assert (tmp_path / chinese_name).read_text(encoding="utf-8") == content
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
    assert (tmp_path / "chapter.txt").is_file()
    assert (tmp_path / "bak" / "good.zip").is_file()


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

    backup_path = tmp_path / "bak" / "series.zip"
    assert backup_path.is_file()
    assert archive_path.exists() is False

    extracted_txt = tmp_path / "chapter1.txt"
    assert extracted_txt.is_file()

    assert any("archive_extracted" in d["status"] for d in stats["archive_details"])


@pytest.mark.asyncio
async def test_scan_library_re_extracts_orphaned_zip_backup(tmp_path: Path, session_factory):
    # A zip in bak/ without a target dir is an orphaned backup — re-extract it
    bak_dir = tmp_path / "bak"
    bak_dir.mkdir()
    backup_path = bak_dir / "series.zip"
    with zipfile.ZipFile(backup_path, "w") as archive:
        archive.writestr("chapter1.txt", "第一章\n\n正文内容\n")

    stats = await scan_library(tmp_path, session_factory)

    assert stats["archives_found"] == 1
    assert stats["archives_extracted"] == 1
    assert (tmp_path / "chapter1.txt").read_text(encoding="utf-8") == "第一章\n\n正文内容\n"
    assert stats["total_files"] == 1


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
    assert not (tmp_path / "bak" / "packed.rar").exists()
    assert stats["total_files"] == 1
    assert stats["scanned"] == 1
    assert stats["new_books"] == 1


@pytest.mark.asyncio
async def test_prepare_archives_skips_non_txt_and_flattens_extracted_zip(tmp_path: Path):
    archive_path = tmp_path / "series.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("book.txt", "第一章\n\n正文\n")
        archive.writestr("cover.jpg", b"fake image")
        archive.writestr("metadata.xml", b"<meta/>")
        archive.writestr("notes/readme.txt", "阅读说明\n")
        archive.writestr("notes/summary.html", b"<html/>")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_extracted_zip"}
    ]

    assert (tmp_path / "book.txt").read_text(encoding="utf-8") == "第一章\n\n正文\n"
    # Nested txt flattened to root
    assert (tmp_path / "readme.txt").read_text(encoding="utf-8") == "阅读说明\n"
    # Non-txt files never extracted
    assert not (tmp_path / "cover.jpg").exists()
    assert not (tmp_path / "metadata.xml").exists()
    assert not (tmp_path / "notes" / "summary.html").exists()
    # Empty dir from zip never created
    assert not (tmp_path / "notes").exists()

    assert (tmp_path / "bak" / "series.zip").is_file()
    assert archive_path.exists() is False


@pytest.mark.asyncio
async def test_prepare_archives_re_extracts_from_orphaned_backup(tmp_path: Path):
    # First extraction: zip → target dir → moved to bak/
    archive_path = tmp_path / "recover.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("chapter.txt", "第一章\n\n正文\n")
        archive.writestr("sub/notes.txt", "附录\n")

    assert await prepare_archives(tmp_path) == [
        {"archive_path": archive_path, "status": "archive_extracted_zip"}
    ]

    backup_path = tmp_path / "bak" / "recover.zip"
    chapter_path = tmp_path / "chapter.txt"
    notes_path = tmp_path / "notes.txt"
    assert chapter_path.read_text(encoding="utf-8") == "第一章\n\n正文\n"
    assert notes_path.read_text(encoding="utf-8") == "附录\n"
    assert backup_path.is_file()
    assert archive_path.exists() is False

    # Delete extracted txt files and re-scan — should re-extract from backup
    chapter_path.unlink()
    notes_path.unlink()
    assert not chapter_path.exists()
    assert not notes_path.exists()

    results = await prepare_archives(tmp_path)
    extracted_results = [r for r in results if r["status"] == "archive_extracted_zip"]
    assert len(extracted_results) == 1
    assert extracted_results[0]["archive_path"] == archive_path

    assert chapter_path.read_text(encoding="utf-8") == "第一章\n\n正文\n"
    assert notes_path.read_text(encoding="utf-8") == "附录\n"
    # Backup still in place, not double-moved
    assert backup_path.is_file()
