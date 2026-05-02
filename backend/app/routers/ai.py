"""AI classification routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Book, AiCache
from app.services.ai_classifier import AIClassifier

router = APIRouter(tags=["ai"])


@router.post("/reanalyze/{book_id}")
async def reanalyze_book(book_id: int, db: AsyncSession = Depends(get_db)):
    """
    Force re-analysis of a book's classification.

    Args:
        book_id: ID of the book to re-analyze
        db: Database session

    Returns:
        Updated classification result
    """
    book_result = await db.execute(select(Book).where(Book.id == book_id))
    book = book_result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    classifier = AIClassifier()
    if not classifier.enabled:
        raise HTTPException(status_code=400, detail="AI classification is disabled")

    from pathlib import Path

    file_path = Path(book.file_path)
    file_hash = await classifier._calculate_file_hash(file_path)
    cache_result = await db.execute(
        select(AiCache).where(AiCache.file_hash == file_hash)
    )
    cache = cache_result.scalar_one_or_none()
    if cache:
        await db.delete(cache)
        await db.commit()

    result = await classifier.classify(file_path, db)

    if not result:
        raise HTTPException(status_code=500, detail="Classification failed")

    book.category = result.get("category")
    book.category_confidence = result.get("confidence")
    book.tags = result.get("tags", [])
    book.tags_source = "ai"
    from datetime import datetime

    book.ai_analyzed_at = datetime.utcnow()

    await db.commit()

    return {
        "book_id": book_id,
        "title": book.title,
        "category": result.get("category"),
        "tags": result.get("tags", []),
        "confidence": result.get("confidence"),
        "cached": result.get("cached", False),
    }


@router.get("/cache/stats")
async def get_cache_stats(db: AsyncSession = Depends(get_db)):
    """
    Get AI cache statistics.

    Returns:
        Cache statistics
    """
    total_result = await db.execute(select(func.count(AiCache.file_hash)))
    total_cached = total_result.scalar()

    category_dist_result = await db.execute(
        select(AiCache.category, func.count(AiCache.file_hash)).group_by(
            AiCache.category
        )
    )
    category_dist = {row[0]: row[1] for row in category_dist_result.all()}

    avg_conf_result = await db.execute(select(func.avg(AiCache.confidence)))
    avg_confidence = avg_conf_result.scalar() or 0.0

    return {
        "total_cached": total_cached,
        "category_distribution": category_dist,
        "average_confidence": round(float(avg_confidence), 2),
    }


@router.post("/cache/clear")
async def clear_cache(db: AsyncSession = Depends(get_db)):
    """
    Clear all AI analysis cache.

    Returns:
        Clear result
    """
    result = await db.execute(select(AiCache))
    entries = result.scalars().all()
    count = len(entries)

    for entry in entries:
        await db.delete(entry)

    await db.commit()

    return {"cleared": True, "count": count}
