"""Tests for auth endpoints."""

import bcrypt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.settings_service import set_setting


class TestAuthStatus:
    @pytest.mark.asyncio
    async def test_auth_status_no_password(self, async_client: AsyncClient):
        response = await async_client.get("/api/v1/auth/status")
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is False
        assert data["has_password"] is False

    @pytest.mark.asyncio
    async def test_auth_status_enabled(
        self, async_client: AsyncClient, db_session: AsyncSession
    ):
        await set_setting(db_session, "app_password_hash", "fakehash")
        await set_setting(db_session, "app_password_enabled", "true")

        response = await async_client.get("/api/v1/auth/status")
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is True
        assert data["has_password"] is True


class TestAuthLogin:
    @pytest.mark.asyncio
    async def test_login_no_password(self, async_client: AsyncClient):
        response = await async_client.post(
            "/api/v1/auth/login",
            json={"password": "anything"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_login_wrong_password(
        self, async_client: AsyncClient, db_session: AsyncSession
    ):
        hashed = bcrypt.hashpw("correct".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        await set_setting(db_session, "app_password_hash", hashed)
        await set_setting(db_session, "app_password_enabled", "true")

        response = await async_client.post(
            "/api/v1/auth/login",
            json={"password": "wrong"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_correct_password(
        self, async_client: AsyncClient, db_session: AsyncSession
    ):
        hashed = bcrypt.hashpw("correct".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        await set_setting(db_session, "app_password_hash", hashed)
        await set_setting(db_session, "app_password_enabled", "true")

        response = await async_client.post(
            "/api/v1/auth/login",
            json={"password": "correct"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert len(data["token"]) > 0
