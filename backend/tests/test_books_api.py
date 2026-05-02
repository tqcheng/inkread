"""Tests for books API endpoints."""

import pytest
from httpx import AsyncClient

from app.models import Book


class TestBooksListEndpoint:
    """Test GET /api/v1/books endpoint."""

    @pytest.mark.asyncio
    async def test_list_books_empty(self, async_client):
        """Test empty book list."""
        response = await async_client.get("/api/v1/books/")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_list_books_with_pagination(self, async_client, db_session, tmp_path):
        """Test pagination."""
        for i in range(5):
            test_file = tmp_path / f"book{i}.txt"
            test_file.write_text(f"content {i}", encoding="utf-8")

            book = Book(
                title=f"书籍{i}",
                filename=f"book{i}.txt",
                file_path=str(test_file),
                file_size=100,
            )
            db_session.add(book)

        await db_session.commit()

        response = await async_client.get("/api/v1/books/?page=1&page_size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1

    @pytest.mark.asyncio
    async def test_list_books_category_filter(self, async_client, db_session, tmp_path):
        """Test category filter."""
        test_file = tmp_path / "wuxia.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(
            title="武侠小说",
            filename="wuxia.txt",
            file_path=str(test_file),
            category="wuxia",
        )
        db_session.add(book)
        await db_session.commit()

        response = await async_client.get("/api/v1/books/?category=wuxia")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["category"] == "wuxia"


class TestFavoriteEndpoint:
    """Test favorite endpoints."""

    @pytest.mark.asyncio
    async def test_add_favorite(self, async_client, db_session, tmp_path):
        """Test adding favorite."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.post(f"/api/v1/books/{book.id}/favorite")
        assert response.status_code == 200
        assert response.json()["is_favorite"] is True

        from sqlalchemy import select

        result = await db_session.execute(select(Book).where(Book.id == book.id))
        updated_book = result.scalar_one()
        assert updated_book.is_favorite is True

    @pytest.mark.asyncio
    async def test_remove_favorite(self, async_client, db_session, tmp_path):
        """Test removing favorite."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(
            title="测试",
            filename="test.txt",
            file_path=str(test_file),
            is_favorite=True,
        )
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.delete(f"/api/v1/books/{book.id}/favorite")
        assert response.status_code == 200
        assert response.json()["is_favorite"] is False


class TestBatchDeleteEndpoint:
    """Test batch delete endpoint."""

    @pytest.mark.asyncio
    async def test_batch_delete(self, async_client, db_session, tmp_path):
        """Test batch delete (soft delete)."""
        books = []
        for i in range(3):
            test_file = tmp_path / f"book{i}.txt"
            test_file.write_text(f"content {i}", encoding="utf-8")

            book = Book(
                title=f"书籍{i}", filename=f"book{i}.txt", file_path=str(test_file)
            )
            db_session.add(book)
            books.append(book)

        await db_session.commit()

        book_ids = [b.id for b in books]
        response = await async_client.post(
            "/api/v1/admin/batch-delete",
            json={"ids": book_ids},
            headers={"X-Admin-Key": "changeme"},
        )

        assert response.status_code == 200
        assert response.json()["deleted"] == 3

        from sqlalchemy import select

        result = await db_session.execute(select(Book).where(Book.id.in_(book_ids)))
        updated_books = result.scalars().all()
        for updated_book in updated_books:
            assert updated_book.is_deleted is True

        for i in range(3):
            assert (tmp_path / f"book{i}.txt").exists()


class TestBookDetailEndpoint:
    """Test GET /api/v1/books/{book_id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_book_detail(self, async_client, db_session, tmp_path):
        """Test getting book details."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(
            title="测试书籍",
            filename="test.txt",
            file_path=str(test_file),
            category="wuxia",
        )
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(f"/api/v1/books/{book.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "测试书籍"
        assert data["category"] == "wuxia"

    @pytest.mark.asyncio
    async def test_get_book_not_found(self, async_client):
        """Test 404 for non-existent book."""
        response = await async_client.get("/api/v1/books/9999")
        assert response.status_code == 404


class TestBookContentEndpoint:
    """Test GET /api/v1/books/{book_id}/content endpoint."""

    @pytest.mark.asyncio
    async def test_get_book_content(self, async_client, db_session, tmp_path):
        """Test getting book content."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("这是测试内容的第一段。\n\n这是第二段。", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(
            f"/api/v1/books/{book.id}/content?offset=0&limit=1000"
        )
        assert response.status_code == 200
        data = response.json()
        assert "这是测试内容" in data["content"]

    @pytest.mark.asyncio
    async def test_get_book_content_with_offset(
        self, async_client, db_session, tmp_path
    ):
        """Test getting book content with offset."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("第一段内容。\n\n第二段内容。", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(
            f"/api/v1/books/{book.id}/content?offset=10&limit=100"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["content"] is not None

    @pytest.mark.asyncio
    async def test_get_book_content_not_found(self, async_client):
        """Test 404 for non-existent book content."""
        response = await async_client.get("/api/v1/books/9999/content")
        assert response.status_code == 404


class TestUncategorizedEndpoint:
    """Test GET /api/v1/books/uncategorized endpoint."""

    @pytest.mark.asyncio
    async def test_get_uncategorized_empty(self, async_client):
        """Test uncategorized with no books."""
        response = await async_client.get("/api/v1/books/uncategorized")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_uncategorized_with_uncategorized_books(
        self, async_client, db_session, tmp_path
    ):
        """Test getting uncategorized books (no category or low confidence)."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(
            title="未分类书籍",
            filename="test.txt",
            file_path=str(test_file),
            category=None,
            category_confidence=0.5,
        )
        db_session.add(book)
        await db_session.commit()

        response = await async_client.get("/api/v1/books/uncategorized")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["title"] == "未分类书籍"

    @pytest.mark.asyncio
    async def test_get_uncategorized_excludes_categorized(
        self, async_client, db_session, tmp_path
    ):
        """Test that categorized books are excluded from uncategorized."""
        test_file1 = tmp_path / "uncategorized.txt"
        test_file1.write_text("content1", encoding="utf-8")
        test_file2 = tmp_path / "categorized.txt"
        test_file2.write_text("content2", encoding="utf-8")

        book1 = Book(
            title="未分类",
            filename="uncategorized.txt",
            file_path=str(test_file1),
            category=None,
            category_confidence=0.5,
        )
        book2 = Book(
            title="已分类",
            filename="categorized.txt",
            file_path=str(test_file2),
            category="wuxia",
            category_confidence=0.9,
        )
        db_session.add(book1)
        db_session.add(book2)
        await db_session.commit()

        response = await async_client.get("/api/v1/books/uncategorized")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["title"] == "未分类"
