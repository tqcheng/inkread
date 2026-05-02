"""Tests for content service."""

import pytest
import aiofiles
from pathlib import Path
from fastapi import HTTPException

from app.services.content import get_book_content, update_reading_progress
from app.models import Book, ReadingProgress


class TestGetBookContent:
    """Test get_book_content function."""

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
