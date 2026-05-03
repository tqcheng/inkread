"""Public auth router for app-level password protection."""

import logging
import secrets

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import AuthStatusResponse, AuthLoginRequest, AuthLoginResponse
from app.services.settings_service import (
    get_app_password_status,
    get_setting,
    set_setting,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/status", response_model=AuthStatusResponse)
async def auth_status(db: AsyncSession = Depends(get_db)):
    status = await get_app_password_status(db)
    return AuthStatusResponse(**status)


@router.post("/login", response_model=AuthLoginResponse)
async def auth_login(
    request: AuthLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    status = await get_app_password_status(db)
    if not status["enabled"] or not status["has_password"]:
        raise HTTPException(status_code=400, detail="Password protection is not enabled")

    stored_hash = await get_setting(db, "app_password_hash")
    if not stored_hash or not bcrypt.checkpw(
        request.password.encode("utf-8"), stored_hash.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Invalid password")

    token = secrets.token_urlsafe(32)
    await set_setting(db, "app_auth_token", token)

    return AuthLoginResponse(token=token)
