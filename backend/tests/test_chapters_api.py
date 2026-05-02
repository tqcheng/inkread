"""Tests for chapters and progress API endpoints."""

import pytest
from httpx import AsyncClient

from app.models import Book, Chapter


class TestChaptersEndpoint:
    """Test GET /api/v1/chapters/books/{book_id}/chapters endpoint."""

    @pytest.mark.asyncio
    async def test_get_chapters_empty(self, async_client, db_session, tmp_path):
        """Test getting chapters for a book with no chapters."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(f"/api/v1/chapters/books/{book.id}/chapters")
        assert response.status_code == 200
        data = response.json()
        assert data["chapters"] == []

    @pytest.mark.asyncio
    async def test_get_chapters_with_data(self, async_client, db_session, tmp_path):
        """Test getting chapters for a book with chapters."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        chapter1 = Chapter(
            book_id=book.id,
            title="第一章",
            position_start=0,
            position_end=100,
            chapter_index=0,
        )
        chapter2 = Chapter(
            book_id=book.id,
            title="第二章",
            position_start=101,
            position_end=200,
            chapter_index=1,
        )
        db_session.add(chapter1)
        db_session.add(chapter2)
        await db_session.commit()

        response = await async_client.get(f"/api/v1/chapters/books/{book.id}/chapters")
        assert response.status_code == 200
        data = response.json()
        assert len(data["chapters"]) == 2
        assert data["chapters"][0]["title"] == "第一章"
        assert data["chapters"][1]["title"] == "第二章"

    @pytest.mark.asyncio
    async def test_get_chapters_book_not_found(self, async_client):
        """Test 404 for non-existent book."""
        response = await async_client.get("/api/v1/chapters/books/9999/chapters")
        assert response.status_code == 404


class TestProgressEndpoint:
    """Test PUT /api/v1/chapters/books/{book_id}/progress endpoint."""

    @pytest.mark.asyncio
    async def test_update_progress(self, async_client, db_session, tmp_path):
        """Test updating reading progress."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.put(
            f"/api/v1/chapters/books/{book.id}/progress",
            json={
                "position": 1500,
                "chapter": "第一章",
                "device_id": "test-device",
                "reading_settings": {"font_size": 18, "theme": "day"},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_progress_minimal(self, async_client, db_session, tmp_path):
        """Test updating progress with minimal data."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.put(
            f"/api/v1/chapters/books/{book.id}/progress",
            json={
                "position": 100,
                "device_id": "test-device",
            },
        )
        assert response.status_code == 200
