"""Admin router - handles admin-only operations."""

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from app.core.database import get_db
from app.models import Book
from app.schemas import AdminBatchDeleteRequest, BookMetadataUpdate, BookResponse, SecuritySettingsRequest
from app.services.settings_service import get_setting, set_setting, get_app_password_status

router = APIRouter()


@router.post("/batch-delete")
async def batch_delete_books(
    request: AdminBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Soft delete books (admin only, requires X-Admin-Key)."""
    if not request.ids:
        raise HTTPException(status_code=400, detail="ids不能为空")

    result = await db.execute(
        select(Book).where(Book.id.in_(request.ids), Book.is_deleted == False)
    )
    books = result.scalars().all()

    if not books:
        raise HTTPException(status_code=404, detail="未找到要删除的书籍")

    for book in books:
        book.is_deleted = True

    await db.commit()

    return {"deleted": len(books)}


@router.put("/metadata/{book_id}", response_model=BookResponse)
async def update_book_metadata(
    book_id: int,
    metadata: BookMetadataUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update book metadata (admin only, requires X-Admin-Key)."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.is_deleted == False)
    )
    book = result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    if metadata.category is not None:
        book.category = metadata.category
    if metadata.tags is not None:
        book.tags = metadata.tags
    # Always force tags_source to "manual" for admin corrections
    book.tags_source = "manual"

    await db.commit()
    await db.refresh(book)

    return BookResponse.model_validate(book)


@router.get("/validate")
async def validate_admin_key():
    """Validate that admin key is configured (health check)."""
    return {"status": "ok", "message": "Admin endpoint accessible"}


@router.get("/cleanup/count")
async def get_orphaned_books_count(db: AsyncSession = Depends(get_db)):
    """Get count of books whose files no longer exist on disk."""
    result = await db.execute(select(Book).where(Book.is_deleted == False))
    books = result.scalars().all()

    orphaned_count = 0
    for book in books:
        if not Path(book.file_path).exists():
            orphaned_count += 1

    return {"orphaned_books": orphaned_count}


@router.post("/cleanup")
async def cleanup_orphaned_books(db: AsyncSession = Depends(get_db)):
    """Hard delete books whose files no longer exist on disk."""
    result = await db.execute(select(Book).where(Book.is_deleted == False))
    books = result.scalars().all()

    deleted_count = 0
    for book in books:
        if not Path(book.file_path).exists():
            await db.delete(book)
            deleted_count += 1

    await db.commit()

    return {"deleted": deleted_count}


@router.post("/reset")
async def reset_database(db: AsyncSession = Depends(get_db)):
    """Reset entire database - delete all data from all tables."""
    # Delete in order due to foreign key constraints
    # First delete child tables, then parent tables
    await db.execute(text("DELETE FROM reading_progress"))
    await db.execute(text("DELETE FROM chapters"))
    await db.execute(text("DELETE FROM books"))
    await db.execute(text("DELETE FROM settings"))
    await db.execute(text("DELETE FROM ai_cache"))

    await db.commit()

    return {"success": True, "message": "数据库已重置"}


@router.post("/settings/security")
async def update_security_settings(
    request: SecuritySettingsRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update app password security settings (admin only)."""
    status = await get_app_password_status(db)

    if request.enabled:
        # Setting or changing password
        if not status["has_password"]:
            # First time: must provide new_password
            if not request.new_password:
                raise HTTPException(status_code=400, detail="New password is required")
            hashed = bcrypt.hashpw(
                request.new_password.encode("utf-8"), bcrypt.gensalt()
            ).decode("utf-8")
            await set_setting(db, "app_password_hash", hashed)
        elif request.new_password:
            # Changing existing password: must verify current
            if not request.current_password:
                raise HTTPException(status_code=400, detail="Current password is required")
            stored_hash = await get_setting(db, "app_password_hash")
            if not stored_hash or not bcrypt.checkpw(
                request.current_password.encode("utf-8"), stored_hash.encode("utf-8")
            ):
                raise HTTPException(status_code=401, detail="Current password is incorrect")
            hashed = bcrypt.hashpw(
                request.new_password.encode("utf-8"), bcrypt.gensalt()
            ).decode("utf-8")
            await set_setting(db, "app_password_hash", hashed)
        else:
            # Re-enabling without changing password: invalidate old token
            await set_setting(db, "app_auth_token", None)

        await set_setting(db, "app_password_enabled", "true")
    else:
        # Disabling: just turn off, no password required
        await set_setting(db, "app_password_enabled", "false")
        await set_setting(db, "app_auth_token", None)

    return {"success": True, "enabled": request.enabled}
