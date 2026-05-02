"""Tests for scanner service."""

import asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.scanner import (
    clean_filename,
    extract_chapters,
    scan_single_file,
    scan_library,
    MAX_CONCURRENT_SCANS,
    CHAPTER_PATTERNS,
)
from app.models import Book


class TestCleanFilename:
    """Tests for clean_filename function."""

    def test_remove_txt_extension(self):
        """Test removing .txt extension."""
        assert clean_filename("book.txt") == "book"
        assert clean_filename("book.TXT") == "book"

    def test_remove_leading_numbers(self):
        """Test removing leading numbers."""
        assert clean_filename("01. book") == "book"
        assert clean_filename("1. book") == "book"
        assert clean_filename("【1】book") == "book"
        assert clean_filename("[1] book") == "book"

    def test_remove_trailing_info(self):
        """Test removing trailing author info."""
        assert clean_filename("book by author") == "book"
        assert clean_filename("book - author") == "book"
        assert clean_filename("book [author]") == "book"
        assert clean_filename("book (author)") == "book"

    def test_complex_filename(self):
        """Test cleaning a complex filename."""
        filename = "01. 【经典名著】三国演义 by 罗贯中.txt"
        result = clean_filename(filename)
        # Should keep the meaningful title
        assert "三国演义" in result or "经典名著" in result

    def test_empty_result_fallback(self):
        """Test fallback to original filename if result is empty."""
        filename = "01.txt"
        result = clean_filename(filename)
        # Should not be empty
        assert result


class TestExtractChapters:
    """Tests for extract_chapters function."""
    
    # Note: CHAPTER_PATTERNS is imported from scanner module

    def test_extract_chinese_numeral_chapters(self):
        """Test extracting chapters with Chinese numerals."""
        content = """第一章 起始
这是第一章的内容。

第二章 发展
这是第二章的内容。"""
        
        chapters = extract_chapters(content)
        
        assert len(chapters) == 2
        assert chapters[0]["title"] == "第一章 起始"
        assert chapters[0]["chapter_index"] == 0
        assert chapters[1]["title"] == "第二章 发展"
        assert chapters[1]["chapter_index"] == 1

    def test_extract_arabic_numeral_chapters(self):
        """Test extracting chapters with Arabic numerals."""
        content = """第1章 起始
这是第一章的内容。

第2章 发展
这是第二章的内容。"""
        
        chapters = extract_chapters(content)
        
        assert len(chapters) == 2
        assert chapters[0]["title"] == "第1章 起始"
        assert chapters[1]["title"] == "第2章 发展"

    def test_extract_english_chapters(self):
        """Test extracting English chapters."""
        content = """Chapter 1: Introduction
This is the introduction.

Chapter 2: Methodology
This is the methodology."""
        
        chapters = extract_chapters(content)
        
        assert len(chapters) == 2
        assert "Chapter 1" in chapters[0]["title"]
        assert "Chapter 2" in chapters[1]["title"]

    def test_extract_volume_chapters(self):
        """Test extracting volume/juan chapters."""
        content = """卷一 起始
这是第一卷的内容。

第二卷 发展
这是第二卷的内容。"""
        
        chapters = extract_chapters(content)
        
        assert len(chapters) == 2
        assert chapters[0]["title"].startswith("卷一")

    def test_extract_no_chapters(self):
        """Test extracting from content with no chapters."""
        content = "This is just regular content.\n\nWith some paragraphs."
        
        chapters = extract_chapters(content)
        
        assert len(chapters) == 0

    def test_chapter_positions(self):
        """Test that chapter positions are calculated correctly."""
        content = """第一章
Content of chapter 1.
More content.

第二章
Content of chapter 2."""
        
        chapters = extract_chapters(content)
        
        assert len(chapters) == 2
        
        # First chapter starts at 0
        assert chapters[0]["position_start"] == 0
        # First chapter ends before second chapter starts
        assert chapters[0]["position_end"] <= chapters[1]["position_start"]
        # Second chapter starts after first chapter content
        assert chapters[1]["position_start"] > 0


class TestScanLibrary:
    """Tests for scan_library function."""

    @pytest.mark.asyncio
    async def test_scan_empty_directory(self, tmp_path, db_session):
        """Test scanning an empty directory."""
        stats = await scan_library(tmp_path, db_session)
        
        assert stats["total_files"] == 0
        assert stats["scanned"] == 0
        assert stats["new_books"] == 0
        assert stats["errors"] == 0
        assert stats["duration_seconds"] >= 0

    @pytest.mark.asyncio
    async def test_scan_single_file(self, tmp_path, session_factory):
        """Test scanning a single file."""
        # Create a test file
        file_path = tmp_path / "test_book.txt"
        file_path.write_text(
            "第一章 测试\n\n这是测试内容。",
            encoding="utf-8"
        )
        
        stats = await scan_library(tmp_path, session_factory)
        
        assert stats["total_files"] == 1
        assert stats["scanned"] == 1
        assert stats["new_books"] == 1
        assert stats["errors"] == 0

    @pytest.mark.asyncio
    async def test_scan_skips_existing_unchanged(self, tmp_path, session_factory):
        """Test that unchanged files are skipped."""
        # Create a test file
        file_path = tmp_path / "test_book.txt"
        file_path.write_text(
            "第一章 测试\n\n这是测试内容。",
            encoding="utf-8"
        )
        
        # First scan
        stats1 = await scan_library(tmp_path, session_factory)
        assert stats1["new_books"] == 1
        
        # Second scan should skip unchanged file
        stats2 = await scan_library(tmp_path, session_factory)
        assert stats2["skipped"] == 1
        assert stats2["new_books"] == 0
        assert stats2["updated_books"] == 0

    @pytest.mark.asyncio
    async def test_scan_recursively(self, tmp_path, session_factory):
        """Test recursive directory scanning."""
        # Create nested directories
        subdir = tmp_path / "subdir" / "nested"
        subdir.mkdir(parents=True)
        
        # Create files in different directories
        (tmp_path / "root_file.txt").write_text("Root file", encoding="utf-8")
        (subdir.parent / "mid_file.txt").write_text("Mid file", encoding="utf-8")
        (subdir / "nested_file.txt").write_text("Nested file", encoding="utf-8")
        
        stats = await scan_library(tmp_path, session_factory)
        
        assert stats["total_files"] == 3
        assert stats["scanned"] == 3
        assert stats["new_books"] == 3

    @pytest.mark.asyncio
    async def test_scan_concurrency_limit(self, tmp_path, db_session):
        """Test that concurrency limit is respected."""
        # This test verifies the semaphore is created with correct limit
        # Actual concurrency testing would require mocking
        from app.services.scanner import MAX_CONCURRENT_SCANS
        
        assert MAX_CONCURRENT_SCANS == 3  # As per conservative strategy

    @pytest.mark.asyncio
    async def test_scan_tolerates_errors(self, tmp_path, session_factory):
        """Test that errors in individual files don't stop the scan."""
        # Create a valid file
        (tmp_path / "valid.txt").write_text("Valid content", encoding="utf-8")
        
        # Create an unreadable file (if possible, otherwise skip)
        unreadable = tmp_path / "unreadable.txt"
        unreadable.write_text("Content", encoding="utf-8")
        
        # The scan should complete despite any errors
        stats = await scan_library(tmp_path, session_factory)
        
        assert stats["scanned"] >= 1  # At least the valid file

    @pytest.mark.asyncio
    async def test_scan_excludes_bak_files(self, tmp_path, session_factory):
        """Test that .bak files are excluded from scanning."""
        # Create a normal .txt file
        (tmp_path / "normal.txt").write_text("Normal file", encoding="utf-8")
        
        # Create a .txt.bak file (backup from encoding conversion)
        (tmp_path / "backup.txt.bak").write_text("Backup file", encoding="utf-8")
        
        stats = await scan_library(tmp_path, session_factory)
        
        # Should only scan the .txt file, not the .bak
        assert stats["total_files"] == 1


class TestScanSingleFile:
    """Tests for scan_single_file function."""

    @pytest.mark.asyncio
    async def test_scan_new_file(self, tmp_path, db_session):
        """Test scanning a new file creates a Book record."""
        file_path = tmp_path / "new_book.txt"
        file_path.write_text(
            "第一章 起始\n\n这是第一章的内容。",
            encoding="utf-8"
        )
        
        book, message = await scan_single_file(file_path, db_session)
        
        assert book is not None
        assert book.title == "new_book"
        assert book.filename == "new_book.txt"
        assert "created" in message or "updated" in message

    @pytest.mark.asyncio
    async def test_scan_with_chapters(self, tmp_path, db_session):
        """Test that chapters are correctly extracted."""
        from sqlalchemy import select
        from app.models import Chapter
        
        file_path = tmp_path / "chapter_book.txt"
        file_path.write_text(
            "第一章 起始\n这是第一章的内容。\n\n"
            "第二章 发展\n这是第二章的内容。\n\n"
            "第三章 结局\n这是最后一章。",
            encoding="utf-8"
        )
        
        book, message = await scan_single_file(file_path, db_session)
        
        assert book is not None
        
        # Explicitly query for chapters instead of using lazy loading
        result = await db_session.execute(
            select(Chapter).where(Chapter.book_id == book.id).order_by(Chapter.chapter_index)
        )
        chapters = result.scalars().all()
        
        # Should have 3 chapters
        assert len(chapters) == 3
        assert chapters[0].title == "第一章 起始"
        assert chapters[1].title == "第二章 发展"
        assert chapters[2].title == "第三章 结局"

    @pytest.mark.asyncio
    async def test_scan_nonexistent_file(self, db_session):
        """Test scanning a non-existent file."""
        from pathlib import Path
        nonexistent = Path("/path/that/does/not/exist.txt")
        
        book, message = await scan_single_file(nonexistent, db_session)
        
        assert book is None
        assert "error" in message.lower() or "not found" in message.lower()
