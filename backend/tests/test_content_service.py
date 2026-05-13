"""Tests for content service."""

import pytest
import aiofiles
from pathlib import Path
from fastapi import HTTPException

from app.services.content import get_book_content, update_reading_progress
from app.models import Book, Chapter, ReadingProgress


class TestGetBookContent:
    """Test get_book_content function."""

    @staticmethod
    async def _create_book_with_chapters(db_session, tmp_path):
        prefix_text = "前言\n"
        chapter_text = "章节开始\n" + ("你" * 70000) + "\n章节结束"
        suffix_text = "\n尾声"

        file_bytes = (
            prefix_text.encode("utf-8")
            + chapter_text.encode("utf-8")
            + suffix_text.encode("utf-8")
        )
        test_file = tmp_path / "chaptered.txt"
        test_file.write_bytes(file_bytes)

        prefix_bytes = prefix_text.encode("utf-8")
        chapter_bytes = chapter_text.encode("utf-8")

        book = Book(
            title="分章测试",
            filename="chaptered.txt",
            file_path=str(test_file),
            file_size=len(file_bytes),
        )
        db_session.add(book)
        await db_session.flush()

        db_session.add_all(
            [
                Chapter(
                    book_id=book.id,
                    title="前言",
                    position_start=0,
                    position_end=len(prefix_bytes),
                    chapter_index=0,
                ),
                Chapter(
                    book_id=book.id,
                    title="正文",
                    position_start=len(prefix_bytes),
                    position_end=len(prefix_bytes) + len(chapter_bytes),
                    chapter_index=1,
                ),
                Chapter(
                    book_id=book.id,
                    title="尾声",
                    position_start=len(prefix_bytes) + len(chapter_bytes),
                    position_end=None,
                    chapter_index=2,
                ),
            ]
        )
        await db_session.commit()
        await db_session.refresh(book)

        return book, chapter_text

    @pytest.mark.asyncio
    async def test_get_book_content_basic(self, db_session, tmp_path):
        """Test basic content retrieval."""
        test_file = tmp_path / "test.txt"
        content = "第一章 测试内容\n\n这是测试内容。"
        test_file.write_text(content, encoding="utf-8")

        book = Book(
            title="测试书籍",
            filename="test.txt",
            file_path=str(test_file),
            file_size=len(content.encode("utf-8")),
        )
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        result = await get_book_content(book.id, 0, 1000, db_session)

        assert result["content"] == content
        assert result["total_size"] == len(content.encode("utf-8"))
        assert result["is_end"] is True
        assert result["next_offset"] is None

    @pytest.mark.asyncio
    async def test_get_book_content_with_offset(self, db_session, tmp_path):
        """Test content retrieval with offset."""
        content = "ABCDEFGHIJ"
        test_file = tmp_path / "test.txt"
        test_file.write_text(content, encoding="utf-8")

        book = Book(
            title="测试",
            filename="test.txt",
            file_path=str(test_file),
            file_size=len(content),
        )
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        result = await get_book_content(book.id, 5, 10, db_session)

        assert result["content"] == "FGHIJ"
        assert result["is_end"] is True

    @pytest.mark.asyncio
    async def test_get_book_content_not_found(self, db_session):
        """Test 404 for non-existent book."""
        with pytest.raises(HTTPException) as exc_info:
            await get_book_content(9999, 0, 1000, db_session)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_book_content_file_not_exists(self, db_session, tmp_path):
        """Test 404 when file doesn't exist."""
        test_file = tmp_path / "nonexistent.txt"

        book = Book(
            title="测试",
            filename="nonexistent.txt",
            file_path=str(test_file),
            file_size=100,
        )
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        with pytest.raises(HTTPException) as exc_info:
            await get_book_content(book.id, 0, 1000, db_session)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_book_content_by_chapter_index_returns_full_middle_chapter(
        self, db_session, tmp_path
    ):
        """Test chapter mode returns the complete middle chapter beyond 200000 bytes."""
        book, chapter_text = await self._create_book_with_chapters(db_session, tmp_path)

        result = await get_book_content(book.id, 0, 1000, db_session, chapter_index=1)

        assert result["content"] == chapter_text
        assert result["content"].startswith("章节开始")
        assert result["content"].endswith("章节结束")
        assert "前言" not in result["content"]
        assert "尾声" not in result["content"]
        assert result["next_offset"] is None
        assert result["is_end"] is True

    @pytest.mark.asyncio
    async def test_get_book_content_missing_chapter_index_raises_404(
        self, db_session, tmp_path
    ):
        """Test missing chapter_index returns 404 instead of falling back to book start."""
        book, _ = await self._create_book_with_chapters(db_session, tmp_path)

        with pytest.raises(HTTPException) as exc_info:
            await get_book_content(book.id, 0, 1000, db_session, chapter_index=99)

        assert exc_info.value.status_code == 404


class TestUpdateReadingProgress:
    """Test update_reading_progress function."""

    @pytest.mark.asyncio
    async def test_update_progress_new(self, db_session, tmp_path):
        """Test creating new progress."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(
            title="测试", filename="test.txt", file_path=str(test_file), file_size=100
        )
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        progress = await update_reading_progress(
            book_id=book.id,
            device_id="device1",
            position=500,
            chapter="第一章",
            settings={"font_size": 18},
            db_session=db_session,
        )

        assert progress.book_id == book.id
        assert progress.device_id == "device1"
        assert progress.current_position == 500
        assert book.last_read_position == 500

    @pytest.mark.asyncio
    async def test_update_progress_existing(self, db_session, tmp_path):
        """Test updating existing progress."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(
            title="测试", filename="test.txt", file_path=str(test_file), file_size=100
        )
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        await update_reading_progress(
            book_id=book.id,
            device_id="device1",
            position=100,
            chapter="序章",
            settings=None,
            db_session=db_session,
        )

        progress = await update_reading_progress(
            book_id=book.id,
            device_id="device1",
            position=500,
            chapter="第一章",
            settings={"font_size": 20},
            db_session=db_session,
        )

        assert progress.current_position == 500
        assert progress.current_chapter == "第一章"

    @pytest.mark.asyncio
    async def test_update_progress_book_not_found(self, db_session):
        """Test 404 when book doesn't exist."""
        with pytest.raises(HTTPException) as exc_info:
            await update_reading_progress(
                book_id=9999,
                device_id="device1",
                position=100,
                chapter=None,
                settings=None,
                db_session=db_session,
            )

        assert exc_info.value.status_code == 404
