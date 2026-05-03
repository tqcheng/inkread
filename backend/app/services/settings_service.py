"""Settings key-value store service."""

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Settings

logger = logging.getLogger(__name__)


async def get_setting(db: AsyncSession, key: str) -> Optional[str]:
    result = await db.execute(select(Settings).where(Settings.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def set_setting(db: AsyncSession, key: str, value: Optional[str]) -> None:
    result = await db.execute(select(Settings).where(Settings.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        row = Settings(key=key, value=value)
        db.add(row)
    await db.commit()


async def get_app_password_status(db: AsyncSession) -> dict:
    enabled_str = await get_setting(db, "app_password_enabled")
    hash_value = await get_setting(db, "app_password_hash")
    return {
        "enabled": enabled_str == "true",
        "has_password": hash_value is not None and hash_value != "",
    }
