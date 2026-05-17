"""Tests for admin auth middleware exemptions."""

import pytest
from httpx import AsyncClient


class TestAdminAuthMiddleware:
    """Verify only the safe admin endpoints bypass the admin key."""

    @pytest.mark.asyncio
    async def test_batch_delete_endpoint_without_key_is_allowed(
        self, async_client: AsyncClient
    ):
        """Batch delete should bypass auth and hit route logic without a key."""
        response = await async_client.post(
            "/api/v1/admin/batch-delete",
            json={"ids": [99999]},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_reset_endpoint_without_key_is_allowed(
        self, async_client: AsyncClient
    ):
        """Reset should bypass auth without a key."""
        response = await async_client.post("/api/v1/admin/reset")
        assert response.status_code == 200
        assert response.json()["success"] is True

    @pytest.mark.asyncio
    async def test_validate_endpoint_without_key_is_rejected(
        self, async_client: AsyncClient
    ):
        """Protected admin routes should still require the admin key."""
        response = await async_client.get("/api/v1/admin/validate")
        assert response.status_code == 401
        assert response.json()["error"] == "UNAUTHORIZED"

    @pytest.mark.asyncio
    async def test_validate_401_includes_cors_headers_for_allowed_origin(
        self, async_client: AsyncClient
    ):
        """Browser requests should receive CORS headers on admin auth failures."""
        response = await async_client.get(
            "/api/v1/admin/validate",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 401
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

    @pytest.mark.asyncio
    async def test_metadata_endpoint_without_key_is_rejected(
        self, async_client: AsyncClient
    ):
        """Metadata updates should remain protected by the admin key."""
        response = await async_client.put(
            "/api/v1/admin/metadata/1",
            json={"category": "wuxia", "tags": ["test"]},
        )
        assert response.status_code == 401
        assert response.json()["error"] == "UNAUTHORIZED"

    @pytest.mark.asyncio
    async def test_cleanup_endpoint_without_key_is_rejected(
        self, async_client: AsyncClient
    ):
        """Protected admin POST routes must not become exempt by mistake."""
        response = await async_client.post("/api/v1/admin/cleanup")
        assert response.status_code == 401
        assert response.json()["error"] == "UNAUTHORIZED"

    @pytest.mark.asyncio
    async def test_cleanup_401_includes_cors_headers_for_allowed_origin(
        self, async_client: AsyncClient
    ):
        """Protected POST auth failures should also include CORS headers."""
        response = await async_client.post(
            "/api/v1/admin/cleanup",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 401
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

    @pytest.mark.asyncio
    async def test_dedup_resolve_endpoint_without_key_is_rejected(
        self, async_client: AsyncClient
    ):
        """Dedup resolution must remain behind the admin key."""
        response = await async_client.post(
            "/api/v1/admin/dedup/resolve",
            json={"keep_id": 1, "duplicate_ids": [2]},
        )
        assert response.status_code == 401
        assert response.json()["error"] == "UNAUTHORIZED"

    @pytest.mark.asyncio
    async def test_security_settings_endpoint_without_key_is_rejected(
        self, async_client: AsyncClient
    ):
        """Security settings must remain behind the admin key."""
        response = await async_client.post(
            "/api/v1/admin/settings/security",
            json={"enabled": True, "new_password": "secret123"},
        )
        assert response.status_code == 401
        assert response.json()["error"] == "UNAUTHORIZED"

    @pytest.mark.asyncio
    async def test_non_admin_endpoint_works_without_key(
        self, async_client: AsyncClient
    ):
        """Non-admin endpoints should remain unaffected."""
        response = await async_client.get("/api/v1/books/")
        assert response.status_code == 200
