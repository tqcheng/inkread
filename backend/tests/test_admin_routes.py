"""Integration tests for admin routes."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_batch_delete_without_admin_key(async_client: AsyncClient):
    """Test batch delete without admin key returns 401."""
    response = await async_client.post("/api/v1/admin/batch-delete", json={"ids": [1]})
    assert response.status_code == 401
    data = response.json()
    assert data["error"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_batch_delete_with_wrong_key(async_client: AsyncClient):
    """Test batch delete with wrong key returns 401."""
    response = await async_client.post(
        "/api/v1/admin/batch-delete",
        json={"ids": [1]},
        headers={"X-Admin-Key": "wrong-key"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_metadata_update_without_key(async_client: AsyncClient):
    """Test metadata update without key returns 401."""
    response = await async_client.put(
        "/api/v1/admin/metadata/1", json={"category": "wuxia", "tags": ["test"]}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_validate_endpoint_with_key(async_client: AsyncClient):
    """Test admin validate endpoint with correct key."""
    response = await async_client.get(
        "/api/v1/admin/validate", headers={"X-Admin-Key": "changeme"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_validate_endpoint_without_key(async_client: AsyncClient):
    """Test admin validate endpoint without key returns 401."""
    response = await async_client.get("/api/v1/admin/validate")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_non_admin_endpoint_returns_book_list(async_client: AsyncClient):
    """Test non-admin endpoints work without key and return proper list structure."""
    response = await async_client.get("/api/v1/books/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_validate_endpoint_without_key_rejects(async_client: AsyncClient):
    """Test admin validate endpoint without key returns 401."""
    response = await async_client.get("/api/v1/admin/validate")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_batch_delete_with_correct_key(async_client: AsyncClient):
    """Test batch delete with correct key (404 if no book exists, but not 401)."""
    response = await async_client.post(
        "/api/v1/admin/batch-delete",
        json={"ids": [99999]},
        headers={"X-Admin-Key": "changeme"},
    )
    assert response.status_code == 404
