"""Tests for settings and AI API endpoints."""

import pytest
from httpx import AsyncClient

from app.models import Book, AiCache


class TestSettingsEndpoint:
    """Test /api/v1/settings endpoints."""

    @pytest.mark.asyncio
    async def test_get_settings(self, async_client):
        """Test getting settings."""
        response = await async_client.get("/api/v1/settings/")
        assert response.status_code == 200
        data = response.json()
        assert "library_path" in data
        assert "ai_provider" in data

    @pytest.mark.asyncio
    async def test_update_settings(self, async_client):
        """Test updating settings."""
        response = await async_client.put(
            "/api/v1/settings/",
            json={"theme": "dark"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["updated"] is True


class TestAICacheStatsEndpoint:
    """Test /api/v1/ai/cache/stats endpoint."""

    @pytest.mark.asyncio
    async def test_get_cache_stats_empty(self, async_client, db_session):
        """Test getting cache stats with empty cache."""
        response = await async_client.get("/api/v1/ai/cache/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["total_cached"] == 0
        assert "category_distribution" in data
        assert "average_confidence" in data

    @pytest.mark.asyncio
    async def test_get_cache_stats_with_data(self, async_client, db_session):
        """Test getting cache stats with cached entries."""
        cache_entry = AiCache(
            file_hash="test_hash_123",
            category="wuxia",
            tags=["武侠", "江湖"],
            confidence=0.85,
        )
        db_session.add(cache_entry)
        await db_session.commit()

        response = await async_client.get("/api/v1/ai/cache/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["total_cached"] == 1
        assert data["category_distribution"]["wuxia"] == 1


class TestAICacheClearEndpoint:
    """Test /api/v1/ai/cache/clear endpoint."""

    @pytest.mark.asyncio
    async def test_clear_cache(self, async_client, db_session):
        """Test clearing AI cache."""
        cache_entry1 = AiCache(
            file_hash="test_hash_1",
            category="wuxia",
            tags=["tag1"],
            confidence=0.8,
        )
        cache_entry2 = AiCache(
            file_hash="test_hash_2",
            category="fantasy",
            tags=["tag2"],
            confidence=0.9,
        )
        db_session.add(cache_entry1)
        db_session.add(cache_entry2)
        await db_session.commit()

        response = await async_client.post("/api/v1/ai/cache/clear")
        assert response.status_code == 200
        data = response.json()
        assert data["cleared"] is True
        assert data["count"] == 2

        stats_response = await async_client.get("/api/v1/ai/cache/stats")
        assert stats_response.json()["total_cached"] == 0


class TestAIReanalyzeEndpoint:
    """Test /api/v1/ai/reanalyze/{book_id} endpoint."""

    @pytest.mark.asyncio
    async def test_reanalyze_disabled(self, async_client, db_session, tmp_path):
        """Test reanalyze when AI is disabled."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("content", encoding="utf-8")

        book = Book(
            title="测试",
            filename="test.txt",
            file_path=str(test_file),
        )
        db_session.add(book)
        await db_session.commit()
        await db_session.refresh(book)

        response = await async_client.post(f"/api/v1/ai/reanalyze/{book.id}")
        assert response.status_code == 400
        assert "disabled" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_reanalyze_book_not_found(self, async_client):
        """Test reanalyze for non-existent book."""
        response = await async_client.post("/api/v1/ai/reanalyze/9999")
        assert response.status_code == 404
