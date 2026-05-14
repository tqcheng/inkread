"""Duplicate grouping and resolution helpers for admin APIs."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Book, Chapter, ReadingProgress
from app.schemas import (
    DedupGroupItem,
    DedupGroupListResponse,
    DedupGroupResponse,
    DedupResolveFileResult,
    DedupResolveRequest,
    DedupResolveResponse,
    DedupSummaryResponse,
)


def _metadata_completeness(book: Book) -> int:
    score = 0
    if book.category:
        score += 1
    if book.tags:
        score += 1
    if book.category_confidence is not None:
        score += 1
    if book.tags_source:
        score += 1
    if book.ai_analyzed_at is not None:
        score += 1
    if book.encoding_original:
        score += 1
    return score


def _recommend_keep_book_id(books: Iterable[Book]) -> int:
    return sorted(
        books,
        key=lambda book: (
            -book.last_read_position,
            -int(book.is_favorite),
            -_metadata_completeness(book),
            -(book.file_mtime.timestamp() if book.file_mtime else 0.0),
            book.id,
        ),
    )[0].id


async def _load_candidate_books(db: AsyncSession) -> list[Book]:
    result = await db.execute(
        select(Book)
        .where(Book.is_deleted == False, Book.content_md5.is_not(None))
        .order_by(Book.content_md5.asc(), Book.id.asc())
    )
    return list(result.scalars().all())


async def _load_chapter_counts(db: AsyncSession, book_ids: list[int]) -> dict[int, int]:
    if not book_ids:
        return {}

    result = await db.execute(
        select(Chapter.book_id, func.count(Chapter.id))
        .where(Chapter.book_id.in_(book_ids))
        .group_by(Chapter.book_id)
    )
    return {book_id: count for book_id, count in result.all()}


async def _build_duplicate_groups(db: AsyncSession) -> tuple[list[DedupGroupResponse], int]:
    books = await _load_candidate_books(db)
    grouped: dict[str, list[Book]] = {}

    for book in books:
        if not book.content_md5:
            continue
        grouped.setdefault(book.content_md5, []).append(book)

    duplicate_groups: list[tuple[str, list[Book]]] = []
    ignored_groups = 0

    for content_md5, items in grouped.items():
        if len(items) <= 1:
            continue
        if any(book.dedup_ignored_at is not None for book in items):
            ignored_groups += 1
            continue
        duplicate_groups.append((content_md5, items))

    chapter_counts = await _load_chapter_counts(
        db,
        [book.id for _, items in duplicate_groups for book in items],
    )

    responses: list[DedupGroupResponse] = []
    for content_md5, items in duplicate_groups:
        recommended_keep_book_id = _recommend_keep_book_id(items)
        ordered_items = sorted(
            items,
            key=lambda book: (
                book.id != recommended_keep_book_id,
                -book.last_read_position,
                -int(book.is_favorite),
                book.id,
            ),
        )
        responses.append(
            DedupGroupResponse(
                content_md5=content_md5,
                count=len(items),
                recommended_keep_book_id=recommended_keep_book_id,
                items=[
                    DedupGroupItem(
                        id=book.id,
                        title=book.title,
                        filename=book.filename,
                        file_path=book.file_path,
                        file_size=book.file_size,
                        file_mtime=book.file_mtime,
                        is_favorite=book.is_favorite,
                        last_read_position=book.last_read_position,
                        chapter_count=chapter_counts.get(book.id, 0),
                    )
                    for book in ordered_items
                ],
            )
        )

    responses.sort(key=lambda group: (-group.count, group.content_md5))
    return responses, ignored_groups


async def get_dedup_summary(db: AsyncSession) -> DedupSummaryResponse:
    groups, ignored_groups = await _build_duplicate_groups(db)
    return DedupSummaryResponse(
        duplicate_groups=len(groups),
        duplicate_books=sum(group.count for group in groups),
        ignored_groups=ignored_groups,
    )


async def list_dedup_groups(db: AsyncSession) -> DedupGroupListResponse:
    groups, _ = await _build_duplicate_groups(db)
    return DedupGroupListResponse(items=groups)


def _merge_book_state(keep: Book, duplicates: list[Book]) -> None:
    all_books = [keep, *duplicates]
    keep.is_favorite = any(book.is_favorite for book in all_books)

    best_progress_book = max(
        all_books,
        key=lambda book: (book.last_read_position, book.id == keep.id, -book.id),
    )
    keep.last_read_position = best_progress_book.last_read_position
    keep.last_read_chapter = best_progress_book.last_read_chapter


async def _merge_reading_progress(
    db: AsyncSession,
    keep: Book,
    duplicates: list[Book],
) -> None:
    relevant_ids = [keep.id, *[book.id for book in duplicates]]
    result = await db.execute(
        select(ReadingProgress)
        .where(ReadingProgress.book_id.in_(relevant_ids))
        .order_by(ReadingProgress.id.asc())
    )
    rows = list(result.scalars().all())
    keep_progress_by_device = {
        row.device_id: row for row in rows if row.book_id == keep.id
    }

    for row in rows:
        if row.book_id == keep.id:
            continue

        existing = keep_progress_by_device.get(row.device_id)
        if existing is None:
            row.book_id = keep.id
            keep_progress_by_device[row.device_id] = row
            continue

        if (
            row.current_position > existing.current_position
            or (
                row.current_position == existing.current_position
                and row.updated_at > existing.updated_at
            )
        ):
            existing.current_position = row.current_position
            existing.current_chapter = row.current_chapter
            existing.reading_settings = row.reading_settings
            existing.updated_at = row.updated_at

        await db.delete(row)

    if keep_progress_by_device:
        best_progress = max(
            keep_progress_by_device.values(),
            key=lambda row: (row.current_position, row.updated_at),
        )
        if best_progress.current_position >= keep.last_read_position:
            keep.last_read_position = best_progress.current_position
            keep.last_read_chapter = best_progress.current_chapter


def _delete_source_files(
    keep: Book,
    duplicates: list[Book],
) -> list[DedupResolveFileResult]:
    results: list[DedupResolveFileResult] = []
    processed_paths: set[str] = set()

    for book in duplicates:
        file_path = book.file_path
        if file_path == keep.file_path:
            results.append(
                DedupResolveFileResult(
                    book_id=book.id,
                    file_path=file_path,
                    deleted=False,
                    reason="kept_file",
                )
            )
            continue

        if file_path in processed_paths:
            results.append(
                DedupResolveFileResult(
                    book_id=book.id,
                    file_path=file_path,
                    deleted=False,
                    reason="duplicate_path",
                )
            )
            continue

        processed_paths.add(file_path)
        path = Path(file_path)
        if not path.exists():
            results.append(
                DedupResolveFileResult(
                    book_id=book.id,
                    file_path=file_path,
                    deleted=False,
                    reason="not_found",
                )
            )
            continue

        try:
            path.unlink()
            results.append(
                DedupResolveFileResult(
                    book_id=book.id,
                    file_path=file_path,
                    deleted=True,
                )
            )
        except OSError as exc:
            results.append(
                DedupResolveFileResult(
                    book_id=book.id,
                    file_path=file_path,
                    deleted=False,
                    reason=str(exc),
                )
            )

    return results


async def resolve_duplicate_group(
    db: AsyncSession,
    request: DedupResolveRequest,
) -> DedupResolveResponse:
    if not request.delete_book_ids:
        raise HTTPException(status_code=400, detail="delete_book_ids不能为空")
    if len(set(request.delete_book_ids)) != len(request.delete_book_ids):
        raise HTTPException(status_code=400, detail="delete_book_ids包含重复项")
    if request.keep_book_id in request.delete_book_ids:
        raise HTTPException(status_code=400, detail="keep_book_id不能出现在delete_book_ids中")

    all_ids = [request.keep_book_id, *request.delete_book_ids]
    result = await db.execute(
        select(Book).where(
            Book.id.in_(all_ids),
            Book.is_deleted == False,
            Book.content_md5 == request.content_md5,
        )
    )
    books = list(result.scalars().all())
    books_by_id = {book.id: book for book in books}

    if len(books) != len(set(all_ids)):
        raise HTTPException(status_code=404, detail="未找到匹配的重复书籍分组")

    keep = books_by_id[request.keep_book_id]
    duplicates = [books_by_id[book_id] for book_id in request.delete_book_ids]

    if any(book.dedup_ignored_at is not None for book in [keep, *duplicates]):
        raise HTTPException(status_code=400, detail="该重复分组已被忽略")

    _merge_book_state(keep, duplicates)
    await _merge_reading_progress(db, keep, duplicates)

    for book in duplicates:
        if request.mode == "soft_delete":
            book.is_deleted = True
        else:
            await db.delete(book)

    await db.commit()
    await db.refresh(keep)

    file_results: list[DedupResolveFileResult] = []
    if request.delete_source_files:
        file_results = _delete_source_files(keep, duplicates)

    return DedupResolveResponse(
        content_md5=request.content_md5,
        keep_book_id=keep.id,
        deleted_book_ids=request.delete_book_ids,
        mode=request.mode,
        delete_source_files=request.delete_source_files,
        file_results=file_results,
    )
