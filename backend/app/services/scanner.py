"""File scanning service for TXT Reader."""

import asyncio
import hashlib
import logging
import os
import re
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any

import aiofiles
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Book, Chapter
from app.services.encoding import detect_encoding, convert_to_utf8
from app.services.ai_classifier import AIClassifier
from app.core.config import settings
from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

# Configuration constants
MAX_CONCURRENT_SCANS = 3  # 保守并发策略
CHAPTER_PATTERNS = [
    r"^\s*第[一二三四五六七八九十百千]+章.*$",  # 中文数字章节
    r"^\s*第\d+章.*$",  # 阿拉伯数字章节
    r"^\s*Chapter\s+\d+.*$",  # 英文章节
    r"^\s*[卷篇][一二三四五六七八九十百千]+.*$",  # 卷/篇格式1: 卷一、篇二
    r"^\s*第[一二三四五六七八九十百千]+[卷篇].*$",  # 卷/篇格式2: 第一卷、第二篇
    r"^\s*第\d+[卷篇].*$",  # 卷/篇格式3: 第1卷、第2篇
]
ARCHIVE_SUFFIXES = {".zip", ".rar"}


def clean_filename(filename: str) -> str:
    """
    Clean filename to extract title.

    Removes .txt extension, common prefixes/suffixes, and extra whitespace.

    Args:
        filename: Original filename

    Returns:
        Cleaned title string
    """
    # Remove .txt extension
    title = filename
    if title.lower().endswith(".txt"):
        title = title[:-4]

    # Remove common prefixes (numbers, brackets, etc.)
    # Remove leading numbers like "01.", "1.", "【1】", etc.
    title = re.sub(r"^[\[\(【]?\d+[\.、\]\)】]?\s*", "", title)

    # Remove common suffixes (author, version info, etc.)
    # Pattern: "书名 by 作者", "书名 - 作者", etc.
    title = re.sub(r"\s*(by|BY|[-—–]|[\(\[（]).*$", "", title)

    # Clean up whitespace
    title = title.strip()

    # Limit length
    if len(title) > 200:
        title = title[:200]

    return title if title else filename


def extract_chapters(file_path: Path) -> List[Dict[str, Any]]:
    """
    Extract chapter titles and byte positions from a file.

    Uses regex patterns to identify chapter boundaries.
    Positions are byte offsets (compatible with file.seek).

    Args:
        file_path: Path to the .txt file

    Returns:
        List of chapter dicts with title, position_start, and position_end
    """
    chapters, _ = extract_chapters_and_md5(file_path)
    return chapters


def extract_chapters_and_md5(file_path: Path) -> Tuple[List[Dict[str, Any]], str]:
    """Extract chapter metadata and content MD5 in a single file pass."""
    chapters = []
    digest = hashlib.md5()
    compiled_patterns = [re.compile(p, re.IGNORECASE) for p in CHAPTER_PATTERNS]

    current_chapter = None
    current_start = 0
    position = 0

    with open(file_path, "rb") as f:
        for line_bytes in f:
            digest.update(line_bytes)
            line = line_bytes.decode("utf-8", errors="ignore").strip()

            is_chapter_line = False
            for pattern in compiled_patterns:
                if pattern.match(line):
                    is_chapter_line = True
                    break

            if is_chapter_line:
                if current_chapter is not None:
                    chapters.append(
                        {
                            "title": current_chapter,
                            "position_start": current_start,
                            "position_end": position,
                            "chapter_index": len(chapters),
                        }
                    )

                current_chapter = line
                current_start = position

            position += len(line_bytes)

    if current_chapter is not None:
        chapters.append(
            {
                "title": current_chapter,
                "position_start": current_start,
                "position_end": position,
                "chapter_index": len(chapters),
            }
        )

    return chapters, digest.hexdigest()


def find_archives(library_path: Path) -> List[Path]:
    """Return sorted archive paths, excluding backup files."""
    archives = [
        path
        for path in library_path.rglob("*")
        if path.is_file()
        and path.suffix.lower() in ARCHIVE_SUFFIXES
        and ".bak" not in {suffix.lower() for suffix in path.suffixes}
    ]
    return sorted(archives)


def _archive_backup_path(archive_path: Path) -> Path:
    """Return the backup path used for extracted archives."""
    return archive_path.with_suffix(f"{archive_path.suffix}.bak")


def _safe_member_destination(root: Path, member_name: str) -> Path:
    """Return a safe extraction destination within root."""
    member_path = Path(member_name)
    if member_path.is_absolute():
        raise ValueError("unsafe archive member path")

    destination = (root / member_path).resolve()
    root_resolved = root.resolve()

    if destination != root_resolved and root_resolved not in destination.parents:
        raise ValueError("unsafe archive member path")

    return destination


def _extract_zip_archive(archive_path: Path, target_dir: Path) -> str:
    """Extract a ZIP archive into target_dir using a temporary sibling directory."""
    temp_dir = target_dir.with_name(f"{target_dir.name}.tmp")

    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)

    try:
        with zipfile.ZipFile(archive_path) as archive:
            temp_dir.mkdir()

            for member in archive.infolist():
                destination = _safe_member_destination(temp_dir, member.filename)

                if member.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                    continue

                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, open(destination, "wb") as output:
                    shutil.copyfileobj(source, output)
    except ValueError:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return "archive_error_unsafe_path"
    except zipfile.BadZipFile:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return "archive_error_bad_zip"
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise

    temp_dir.rename(target_dir)
    archive_path.rename(_archive_backup_path(archive_path))
    return "archive_extracted_zip"


async def prepare_archives(library_path: Path) -> List[Dict[str, Any]]:
    """Prepare archive work items for scanning."""
    results = []

    for archive_path in find_archives(library_path):
        target_dir = archive_path.with_suffix("")
        backup_path = _archive_backup_path(archive_path)

        if target_dir.is_dir():
            status = "archive_skipped_target_exists"
        elif target_dir.is_file():
            status = "archive_skipped_target_conflict"
        elif backup_path.exists():
            status = "archive_skipped_backup_exists"
        elif archive_path.suffix.lower() == ".zip":
            status = await asyncio.to_thread(_extract_zip_archive, archive_path, target_dir)
        elif archive_path.suffix.lower() == ".rar":
            status = "archive_error_rar_unsupported"
        else:
            status = "archive_error_unsupported_archive"

        results.append({"archive_path": archive_path, "status": status})

    return results


async def scan_single_file(
    file_path: Path, db_session: AsyncSession
) -> Tuple[Optional[Book], str]:
    """
    Scan a single file and add/update database record.

    This function handles:
    1. Encoding detection and conversion
    2. File metadata extraction
    3. Chapter extraction
    4. Database record creation/update

    Args:
        file_path: Path to the .txt file
        db_session: Database session for operations

    Returns:
        Tuple of (Book object or None, status message)
    """
    from sqlalchemy import select

    try:
        # Get file stats (use os.stat in thread to avoid blocking)
        stat = await asyncio.to_thread(os.stat, file_path)
        file_size = stat.st_size
        mtime = datetime.fromtimestamp(stat.st_mtime)

        filename = file_path.name

        # Check if file already exists in database
        existing_result = await db_session.execute(
            select(Book).where(Book.filename == filename)
        )
        existing_book = existing_result.scalar_one_or_none()

        if existing_book:
            # Check if file has been modified
            if (
                existing_book.file_size == file_size
                and existing_book.file_mtime == mtime
            ):
                # File unchanged, skip
                logger.debug(f"Skipping unchanged file: {filename}")
                return existing_book, "skipped_unchanged"
            else:
                # File modified, will update
                logger.info(f"Updating modified file: {filename}")

        # Detect and convert encoding
        encoding, confidence = await detect_encoding(file_path)

        original_encoding = encoding
        is_converted = False
        content_md5 = None

        if encoding and encoding.upper() not in ("UTF-8", "UTF8", "ASCII"):
            # Try to convert to UTF-8 (aggressive mode for scan)
            converted, convert_msg, original_md5 = await convert_to_utf8(
                file_path, aggressive=True
            )
            is_converted = converted
            if converted:
                content_md5 = original_md5
                stat = await asyncio.to_thread(os.stat, file_path)
                file_size = stat.st_size
                mtime = datetime.fromtimestamp(stat.st_mtime)
                logger.info(f"Converted {filename} from {encoding} to UTF-8")
            else:
                logger.warning(f"Failed to convert {filename}: {convert_msg}")

        if is_converted:
            chapters = extract_chapters(file_path)
        else:
            # Extract chapters (byte positions) and content hash in one pass
            chapters, content_md5 = extract_chapters_and_md5(file_path)

        # Clean filename to get title
        title = clean_filename(filename)

        # Track if this is an update or create
        is_update = existing_book is not None

        # Create or update Book record
        if existing_book:
            # Update existing
            existing_book.title = title
            existing_book.file_size = file_size
            existing_book.file_mtime = mtime
            existing_book.file_path = str(file_path)
            existing_book.content_md5 = content_md5
            existing_book.encoding_original = original_encoding
            existing_book.is_utf8_converted = is_converted
            existing_book.updated_at = datetime.utcnow()
        else:
            # Create new
            existing_book = Book(
                title=title,
                filename=filename,
                file_path=str(file_path),
                file_size=file_size,
                file_mtime=mtime,
                content_md5=content_md5,
                encoding_original=original_encoding,
                is_utf8_converted=is_converted,
            )
            db_session.add(existing_book)

        # Flush to get book ID
        await db_session.flush()

        # Remove old chapters on update to avoid duplicates
        if is_update:
            from sqlalchemy import delete
            await db_session.execute(
                delete(Chapter).where(Chapter.book_id == existing_book.id)
            )

        # Create Chapter records
        for chapter_data in chapters:
            chapter = Chapter(
                book_id=existing_book.id,
                title=chapter_data["title"],
                position_start=chapter_data["position_start"],
                position_end=chapter_data["position_end"],
                chapter_index=chapter_data["chapter_index"],
            )
            db_session.add(chapter)

        # Commit all changes
        await db_session.commit()

        # Start AI classification in background if enabled
        if settings.AI_PROVIDER != "disabled":
            asyncio.create_task(_classify_book_async(file_path, existing_book.id))

        action = "updated" if is_update else "created"
        logger.info(
            f"Successfully {action} book record for: {filename} with {len(chapters)} chapters"
        )
        return existing_book, f"{action}_with_{len(chapters)}_chapters"

    except Exception as e:
        await db_session.rollback()
        logger.exception(f"Error scanning file {file_path}: {e}")
        return None, f"error_{type(e).__name__}"


async def scan_library(
    library_path: Path, session_factory, max_concurrent: int = MAX_CONCURRENT_SCANS
) -> Dict[str, Any]:
    """
    Scan entire library directory recursively.

    This function:
    1. Recursively finds all .txt files
    2. Checks existing database records
    3. Processes files with limited concurrency
    4. Returns detailed statistics

    Args:
        library_path: Root path to scan
        session_factory: AsyncSession factory (e.g., AsyncSessionLocal)
        max_concurrent: Maximum concurrent file processing (default: 3)

    Returns:
        Dictionary with scan statistics
    """
    import time

    start_time = time.time()

    # Find all .txt files recursively
    txt_files = list(library_path.rglob("*.txt"))

    # Filter out .bak files
    txt_files = [f for f in txt_files if not f.suffixes or ".bak" not in f.suffixes]

    logger.info(f"Found {len(txt_files)} .txt files in {library_path}")

    # Statistics
    stats = {
        "total_files": len(txt_files),
        "scanned": 0,
        "converted": 0,
        "skipped": 0,
        "errors": 0,
        "new_books": 0,
        "updated_books": 0,
        "details": [],
    }

    # Semaphore for limiting concurrency
    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_file(file_path: Path) -> None:
        """Process a single file with semaphore and its own session."""
        async with semaphore:
            async with session_factory() as session:
                try:
                    book, message = await scan_single_file(file_path, session)

                    stats["scanned"] += 1

                    if "converted" in message:
                        stats["converted"] += 1

                    if "skipped" in message:
                        stats["skipped"] += 1
                    elif "created" in message:
                        stats["new_books"] += 1
                    elif "updated" in message:
                        stats["updated_books"] += 1
                    elif "error" in message:
                        stats["errors"] += 1

                    stats["details"].append(
                        {
                            "file": file_path.name,
                            "status": message,
                            "book_id": book.id if book else None,
                        }
                    )

                except Exception as e:
                    logger.error(f"Error processing {file_path}: {e}")
                    stats["errors"] += 1
                    stats["scanned"] += 1
                    stats["details"].append(
                        {
                            "file": file_path.name,
                            "status": f"error_{type(e).__name__}",
                            "book_id": None,
                        }
                    )

    # Process all files concurrently with semaphore
    tasks = [process_file(f) for f in txt_files]
    await asyncio.gather(*tasks)

    # Calculate duration
    duration = time.time() - start_time

    stats["duration_seconds"] = round(duration, 2)

    logger.info(
        f"Library scan completed in {duration:.2f}s: "
        f"{stats['scanned']} scanned, "
        f"{stats['new_books']} new, "
        f"{stats['updated_books']} updated, "
        f"{stats['converted']} converted, "
        f"{stats['errors']} errors"
    )

    return stats


async def _classify_book_async(file_path: Path, book_id: int):
    """Background task to classify a book and update database."""
    try:
        async with AsyncSessionLocal() as session:
            from sqlalchemy import select
            from app.models import Book

            # Get book
            result = await session.execute(select(Book).where(Book.id == book_id))
            book = result.scalar_one_or_none()

            if not book:
                logger.warning(f"Book {book_id} not found for AI classification")
                return

            # Classify
            classifier = AIClassifier()
            ai_result = await classifier.classify(file_path, session)

            if ai_result:
                # Update book
                book.category = ai_result.get("category")
                book.category_confidence = ai_result.get("confidence")
                book.tags = ai_result.get("tags", [])
                book.tags_source = "ai"
                book.ai_analyzed_at = datetime.utcnow()

                await session.commit()
                logger.info(
                    f"AI classification completed for book {book_id}: {ai_result.get('category')}"
                )
    except Exception as e:
        logger.exception(f"Background AI classification failed for book {book_id}: {e}")
