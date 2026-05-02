"""Tests for admin auth middleware."""

import pytest
from httpx import AsyncClient


class TestAdminAuthMiddleware:
    """Test admin authentication middleware."""

    @pytest.mark.asyncio
    async def test_admin_endpoint_without_key(self, async_client: AsyncClient):
        """Test admin endpoint returns 401 without key."""
        response = await async_client.post(
            "/api/v1/admin/batch-delete", json={"ids": [1]}
        )
        assert response.status_code == 401
        data = response.json()
        assert data["error"] == "UNAUTHORIZED"

    @pytest.mark.asyncio
    async def test_admin_endpoint_with_wrong_key(self, async_client: AsyncClient):
        """Test admin endpoint returns 401 with wrong key."""
        response = await async_client.post(
            "/api/v1/admin/batch-delete",
            json={"ids": [1]},
            headers={"X-Admin-Key": "wrong-key"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_non_admin_endpoint_works_without_key(
        self, async_client: AsyncClient
    ):
        """Test non-admin endpoints work without key."""
        response = await async_client.get("/api/v1/books/")
        assert response.status_code == 200
