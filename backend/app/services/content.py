import aiofiles
from typing import Optional
from datetime import datetime
from pathlib import Path
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Book, Chapter, ReadingProgress


async def get_book_content(
    book_id: int, offset: int, limit: int, db_session: AsyncSession,
    chapter_index: int | None = None,
) -> dict:
    """
    获取书籍内容（分页读取或按章节读取）

    Args:
        book_id: 书籍 ID
        offset: 字节偏移量
        limit: 最大字符数
        db_session: 数据库会话
        chapter_index: 可选，按章节索引获取指定章节内容

    Returns:
        dict: {content, next_offset, total_size, is_end}
    """
    if limit > 200000:
        raise HTTPException(status_code=400, detail="limit 最大为 200000")

    result = await db_session.execute(
        select(Book).where(Book.id == book_id, Book.is_deleted == False)
    )
    book = result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    file_path = Path(book.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    file_size = file_path.stat().st_size

    # If chapter_index is provided, read that chapter's exact range
    if chapter_index is not None:
        ch_result = await db_session.execute(
            select(Chapter)
            .where(Chapter.book_id == book_id, Chapter.chapter_index == chapter_index)
        )
        chapter = ch_result.scalar_one_or_none()
        if chapter:
            offset = chapter.position_start
            limit = min(chapter.position_end - chapter.position_start, 200000) if chapter.position_end else 200000
        else:
            # Chapter not found, fall back to offset/limit with safe defaults
            offset = 0
            limit = 200000

    async with aiofiles.open(file_path, "rb") as f:
        await f.seek(offset)
        raw_bytes = await f.read(limit)
        content = raw_bytes.decode("utf-8", errors="ignore")

        current_pos = await f.tell()

        is_end = current_pos >= file_size
        next_offset = current_pos if not is_end else None

    return {
        "content": content,
        "next_offset": next_offset,
        "total_size": file_size,
        "is_end": is_end,
    }


async def update_reading_progress(
    book_id: int,
    device_id: str,
    position: int,
    chapter: Optional[str],
    settings: Optional[dict],
    db_session: AsyncSession,
) -> ReadingProgress:
    """
    更新阅读进度

    Args:
        book_id: 书籍 ID
        device_id: 设备 ID
        position: 当前阅读位置（字节偏移）
        chapter: 当前章节名
        settings: 阅读设置
        db_session: 数据库会话

    Returns:
        ReadingProgress: 更新后的进度记录
    """
    book_result = await db_session.execute(select(Book).where(Book.id == book_id))
    book = book_result.scalar_one_or_none()

    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    result = await db_session.execute(
        select(ReadingProgress).where(
            ReadingProgress.book_id == book_id, ReadingProgress.device_id == device_id
        )
    )
    progress = result.scalar_one_or_none()

    if progress:
        progress.current_position = position
        progress.current_chapter = chapter
        progress.reading_settings = settings
        progress.updated_at = datetime.utcnow()
    else:
        progress = ReadingProgress(
            book_id=book_id,
            device_id=device_id,
            current_position=position,
            current_chapter=chapter,
            reading_settings=settings,
        )
        db_session.add(progress)

    book.last_read_position = position
    book.last_read_chapter = chapter

    await db_session.commit()
    await db_session.refresh(progress)

    return progress
