"""
Fix existing chapter positions from character offsets to byte offsets.
Run: python fix_chapters.py
"""
import asyncio
from pathlib import Path
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal, init_db
from app.models import Book, Chapter
from app.services.scanner import extract_chapters


async def fix_all():
    await init_db()
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Book).where(Book.is_deleted == False))
        books = result.scalars().all()

        fixed = 0
        for book in books:
            file_path = Path(book.file_path)
            if not file_path.exists():
                print(f"Skip (missing): {book.title}")
                continue

            # Delete old chapters
            await session.execute(delete(Chapter).where(Chapter.book_id == book.id))

            # Re-extract with byte positions
            chapters = extract_chapters(file_path)
            for ch in chapters:
                session.add(Chapter(
                    book_id=book.id,
                    title=ch["title"],
                    position_start=ch["position_start"],
                    position_end=ch["position_end"],
                    chapter_index=ch["chapter_index"],
                ))

            fixed += 1
            print(f"Fixed: {book.title} ({len(chapters)} chapters)")

        await session.commit()
        print(f"\nDone. Fixed {fixed} books.")


if __name__ == "__main__":
    asyncio.run(fix_all())
