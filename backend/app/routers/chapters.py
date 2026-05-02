from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.models import Book, Chapter
from app.services.content import update_reading_progress


router = APIRouter()


class ProgressUpdate(BaseModel):
    position: int
    chapter: Optional[str] = None
    device_id: str
    reading_settings: Optional[dict] = None


@router.get("/books/{book_id}/chapters")
async def get_chapters(book_id: int, db: AsyncSession = Depends(get_db)):
    """Get chapters for a book."""
    # Check book exists
    book_result = await db.execute(
        select(Book).where(Book.id == book_id, Book.is_deleted == False)
    )
    book = book_result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    # Get chapters
    result = await db.execute(
        select(Chapter)
        .where(Chapter.book_id == book_id)
        .order_by(Chapter.chapter_index)
    )
    chapters = result.scalars().all()

    return {
        "chapters": [
            {
                "id": ch.id,
                "title": ch.title,
                "position_start": ch.position_start,
                "chapter_index": ch.chapter_index,
            }
            for ch in chapters
        ]
    }


@router.put("/books/{book_id}/progress")
async def update_progress(
    book_id: int, progress: ProgressUpdate, db: AsyncSession = Depends(get_db)
):
    """Update reading progress."""
    await update_reading_progress(
        book_id=book_id,
        device_id=progress.device_id,
        position=progress.position,
        chapter=progress.chapter,
        settings=progress.reading_settings,
        db_session=db,
    )

    return {"updated": True}
