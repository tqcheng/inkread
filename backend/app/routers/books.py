"""Books router - handles book listing, details, content, and management."""

from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, asc, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional

import aiofiles
from app.core.database import get_db
from app.models import Book
from app.schemas import (
    BookResponse,
    BookList,
    BookContentResponse,
    BookSearchResponse,
    BookSearchResult,
)
from app.services.content import get_book_content as get_content

router = APIRouter(tags=["books"])


@router.get("/", response_model=BookList)
async def list_books(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="FTS5 search query"),
    sort: str = Query(
        "created_at",
        description="Sort field: created_at, title, file_size, category_confidence",
    ),
    order: str = Query("desc", description="Sort order: asc, desc"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    confidence_min: Optional[float] = Query(
        None, ge=0, le=1, description="Minimum AI confidence"
    ),
    is_favorite: Optional[bool] = Query(None, description="Filter by favorite status"),
    db: AsyncSession = Depends(get_db),
):
    """List books with pagination, filtering, and sorting."""
    query = select(Book).where(Book.is_deleted == False)

    if category:
        query = query.where(Book.category == category)

    if confidence_min is not None:
        query = query.where(Book.category_confidence >= confidence_min)

    if is_favorite is not None:
        query = query.where(Book.is_favorite == is_favorite)

    if search:
        query = query.where(
            text("id IN (SELECT rowid FROM books_fts WHERE books_fts MATCH :search)")
        ).params(search=f"{search}*")

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    sort_column = getattr(Book, sort, Book.created_at)
    if order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(asc(sort_column))

    query = query.options(selectinload(Book.chapters))

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    books = result.scalars().all()

    pages = (total + page_size - 1) // page_size if page_size > 0 else 0

    return BookList(
        items=[BookResponse.model_validate(b) for b in books],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/uncategorized", response_model=BookList)
async def get_uncategorized_books(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
):
    """Get books with low AI confidence or uncategorized."""
    query = select(Book).where(
        Book.is_deleted == False,
        (Book.category == None) | (Book.category_confidence < 0.7),
    )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(desc(Book.created_at))
    query = query.options(selectinload(Book.chapters))

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    books = result.scalars().all()

    pages = (total + page_size - 1) // page_size if page_size > 0 else 0

    return BookList(
        items=[BookResponse.model_validate(b) for b in books],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{book_id}", response_model=BookResponse)
async def get_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get book details with chapters."""
    result = await db.execute(
        select(Book)
        .where(Book.id == book_id, Book.is_deleted == False)
        .options(selectinload(Book.chapters))
    )
    book = result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    book.chapters.sort(key=lambda c: c.chapter_index or 0)

    return BookResponse.model_validate(book)


@router.get("/{book_id}/content")
async def get_book_content(
    book_id: int,
    offset: int = Query(0, ge=0, description="Byte offset"),
    limit: int = Query(10000, ge=1, le=200000, description="Max characters"),
    chapter_index: int | None = Query(None, ge=0, description="Chapter index (overrides offset/limit)"),
    db: AsyncSession = Depends(get_db),
):
    """Get book content with pagination or by chapter index."""
    result = await get_content(book_id, offset, limit, db, chapter_index=chapter_index)

    return BookContentResponse(
        book_id=book_id,
        content=result["content"],
        next_offset=result["next_offset"],
        is_end=result["is_end"],
    )


@router.get("/{book_id}/search", response_model=BookSearchResponse)
async def search_book_content(
    book_id: int,
    q: str = Query(..., min_length=1, description="Search query"),
    db: AsyncSession = Depends(get_db),
):
    """Search for occurrences of a query string within a book's content."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.is_deleted == False)
    )
    book = result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    file_path = Path(book.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    async with aiofiles.open(file_path, "rb") as f:
        raw_bytes = await f.read()

    content = raw_bytes.decode("utf-8", errors="ignore")
    total_chars = len(content)

    if total_chars == 0:
        return BookSearchResponse(book_id=book_id, query=q, results=[])

    query_lower = q.lower()
    content_lower = content.lower()
    results: list[BookSearchResult] = []
    context_radius = 30
    start = 0

    while True:
        idx = content_lower.find(query_lower, start)
        if idx == -1:
            break

        offset = len(content[:idx].encode("utf-8"))

        context_start = idx
        context_end = min(total_chars, idx + len(q) + context_radius + 30)
        context = content[context_start:context_end]

        position_percent = min(100, int((idx / total_chars) * 100))

        results.append(
            BookSearchResult(
                offset=offset,
                context=context,
                position_percent=position_percent,
            )
        )

        start = idx + len(q)

    return BookSearchResponse(book_id=book_id, query=q, results=results)


@router.post("/{book_id}/favorite")
async def set_favorite(
    book_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Set book as favorite."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.is_deleted == False)
    )
    book = result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    book.is_favorite = True
    await db.commit()

    return {"is_favorite": True}


@router.delete("/{book_id}/favorite")
async def unset_favorite(
    book_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Remove book from favorites."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.is_deleted == False)
    )
    book = result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    book.is_favorite = False
    await db.commit()

    return {"is_favorite": False}
