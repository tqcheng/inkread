"""Tests for scanner service - simplified for quick verification."""

import pytest

from app.services.scanner import (
    clean_filename,
    extract_chapters,
    MAX_CONCURRENT_SCANS,
)


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
        
        assert len(chapters) >= 1, f"Expected at least 1 chapter, got {len(chapters)}"

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
        # First chapter ends before or at second chapter starts
        assert chapters[0]["position_end"] <= chapters[1]["position_start"]
        # Second chapter starts after first chapter content
        assert chapters[1]["position_start"] > 0


def test_concurrency_limit():
    """Test that concurrency limit is correct."""
    assert MAX_CONCURRENT_SCANS == 3, "Concurrency limit should be 3 (conservative strategy)"
