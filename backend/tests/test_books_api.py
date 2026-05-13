"""Tests for books API endpoints."""

import pytest
from httpx import AsyncClient

from app.models import Book, Chapter


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
        test_file = tmp_path / "chaptered-api.txt"
        test_file.write_bytes(file_bytes)

        prefix_bytes = prefix_text.encode("utf-8")
        chapter_bytes = chapter_text.encode("utf-8")

        book = Book(
            title="接口分章测试",
            filename="chaptered-api.txt",
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

    @pytest.mark.asyncio
    async def test_get_book_content_by_chapter_index(
        self, async_client, db_session, tmp_path
    ):
        """Test chapter_index endpoint returns a full middle chapter."""
        book, chapter_text = await self._create_book_with_chapters(db_session, tmp_path)

        response = await async_client.get(
            f"/api/v1/books/{book.id}/content?chapter_index=1"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["content"] == chapter_text
        assert data["next_offset"] is None
        assert data["is_end"] is True

    @pytest.mark.asyncio
    async def test_get_book_content_by_chapter_index_ignores_large_limit(
        self, async_client, db_session, tmp_path
    ):
        """Test chapter_index requests bypass offset/limit validation semantics."""
        book, chapter_text = await self._create_book_with_chapters(db_session, tmp_path)

        response = await async_client.get(
            f"/api/v1/books/{book.id}/content?chapter_index=1&limit=999999"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["content"] == chapter_text
        assert data["next_offset"] is None
        assert data["is_end"] is True

    @pytest.mark.asyncio
    async def test_get_book_content_by_missing_chapter_index_returns_404(
        self, async_client, db_session, tmp_path
    ):
        """Test chapter_index endpoint returns 404 for an unknown chapter."""
        book, _ = await self._create_book_with_chapters(db_session, tmp_path)

        response = await async_client.get(
            f"/api/v1/books/{book.id}/content?chapter_index=99"
        )

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


class TestBookSearchEndpoint:
    """Test GET /api/v1/books/{book_id}/search endpoint."""

    @pytest.mark.asyncio
    async def test_search_book_content(self, async_client, db_session, tmp_path):
        """Test searching within book content."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("这是第一章的内容。李白在这里出现。后面还有更多内容。", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(f"/api/v1/books/{book.id}/search?q=李白")
        assert response.status_code == 200
        data = response.json()
        assert data["book_id"] == book.id
        assert data["query"] == "李白"
        assert len(data["results"]) == 1
        assert "李白" in data["results"][0]["context"]
        assert data["results"][0]["context"].startswith("李白")
        assert data["results"][0]["position_percent"] >= 0
        assert data["results"][0]["offset"] >= 0

    @pytest.mark.asyncio
    async def test_search_no_results(self, async_client, db_session, tmp_path):
        """Test search with no matches."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("这是一段测试内容。", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(f"/api/v1/books/{book.id}/search?q=不存在")
        assert response.status_code == 200
        data = response.json()
        assert data["results"] == []

    @pytest.mark.asyncio
    async def test_search_book_not_found(self, async_client):
        """Test 404 for non-existent book."""
        response = await async_client.get("/api/v1/books/9999/search?q=test")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_search_empty_query(self, async_client, db_session, tmp_path):
        """Test search with empty query returns 422."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("内容", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(f"/api/v1/books/{book.id}/search?q=")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_search_multiple_matches(self, async_client, db_session, tmp_path):
        """Test search returns all occurrences."""
        content = "第一段提到李白。中间还有李白。最后又是李白。"
        test_file = tmp_path / "test.txt"
        test_file.write_text(content, encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(f"/api/v1/books/{book.id}/search?q=李白")
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 3
        assert data["results"][0]["offset"] < data["results"][1]["offset"] < data["results"][2]["offset"]

    @pytest.mark.asyncio
    async def test_search_offset_correctness(self, async_client, db_session, tmp_path):
        """Test that search offset matches actual content position."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("这是开头。然后李白出现了。这是结尾。", encoding="utf-8")

        book = Book(title="测试", filename="test.txt", file_path=str(test_file))
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.get(f"/api/v1/books/{book.id}/search?q=李白")
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 1
        offset = data["results"][0]["offset"]

        content_response = await async_client.get(
            f"/api/v1/books/{book.id}/content?offset={offset}&limit=50"
        )
        assert content_response.status_code == 200
        assert "李白" in content_response.json()["content"]
