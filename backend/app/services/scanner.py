"""File scanning service for TXT Reader."""

import asyncio
import hashlib
import logging
import os
import re
import tempfile
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
ZIP_LEGACY_FILENAME_ENCODINGS = ("gb18030", "gbk", "big5", "cp437")


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


def extract_chapters(file_path: Path | str) -> List[Dict[str, Any]]:
    """
    Extract chapter titles and byte positions from a file.

    Uses regex patterns to identify chapter boundaries.
    Positions are byte offsets (compatible with file.seek).

    Args:
        file_path: Path to the .txt file, or raw text content for legacy callers

    Returns:
        List of chapter dicts with title, position_start, and position_end
    """
    if isinstance(file_path, str) and ("\n" in file_path or "\r" in file_path):
        chapters = []
        compiled_patterns = [re.compile(p, re.IGNORECASE) for p in CHAPTER_PATTERNS]
        current_chapter = None
        current_start = 0
        position = 0

        for line in file_path.splitlines(keepends=True):
            normalized_line = line.strip()
            is_chapter_line = any(pattern.match(normalized_line) for pattern in compiled_patterns)

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

                current_chapter = normalized_line
                current_start = position

            position += len(line.encode("utf-8"))

        if current_chapter is not None:
            chapters.append(
                {
                    "title": current_chapter,
                    "position_start": current_start,
                    "position_end": position,
                    "chapter_index": len(chapters),
                }
            )

        return chapters

    chapters, _ = extract_chapters_and_md5(Path(file_path))
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
        and "bak" not in path.relative_to(library_path).parts
    ]
    return sorted(archives)


def _archive_backup_dir(archive_path: Path) -> Path:
    """Return the backup directory for extracted archives."""
    return archive_path.parent / "bak"


def _archive_backup_path(archive_path: Path) -> Path:
    """Return the backup path used for extracted archives."""
    return _archive_backup_dir(archive_path) / archive_path.name


def _archive_extract_dir(archive_path: Path) -> Path:
    """Return the directory where extracted txt files should be published."""
    return archive_path.parent


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


def _filename_quality_score(filename: str) -> int:
    """Return a quality score for a decoded filename; lower is better."""
    score = 0
    for ch in filename:
        if ch == "\ufffd":
            score += 1000
        elif "\u4e00" <= ch <= "\u9fff":
            score -= 20
        elif "\u2500" <= ch <= "\u257f":
            score += 50
        elif "\u00c0" <= ch <= "\u00ff":
            score += 5
    return score


def _decode_zip_member_name(info: zipfile.ZipInfo) -> str:
    """Decode zip member name, recovering legacy Chinese encodings if needed."""
    if info.flag_bits & 0x800:
        return info.filename

    try:
        raw_bytes = info.filename.encode("cp437")
    except UnicodeEncodeError:
        # Filename cannot be encoded as cp437 — it is already Unicode despite
        # the missing UTF-8 flag.  Return it as-is.
        return info.filename

    candidates = []
    for encoding in ZIP_LEGACY_FILENAME_ENCODINGS:
        try:
            candidate = raw_bytes.decode(encoding, errors="replace")
            candidates.append(candidate)
        except (UnicodeDecodeError, LookupError):
            continue

    if not candidates:
        return info.filename

    return min(candidates, key=_filename_quality_score)


def _clean_non_txt_files(directory: Path) -> None:
    """Remove all non-.txt files and empty directories."""
    for item in list(directory.rglob("*")):
        if item.is_file() and item.suffix.lower() != ".txt":
            item.unlink()
    for item in sorted(directory.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if item.is_dir() and not any(item.iterdir()):
            item.rmdir()


def _zip_txt_output_names(archive_path: Path) -> List[str]:
    """Return flattened txt output names for a zip archive."""
    output_names = []
    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            decoded_name = _decode_zip_member_name(member)
            if not decoded_name.lower().endswith(".txt"):
                continue
            output_names.append(Path(decoded_name).name)
    return output_names


def _extract_zip_archive(
    archive_path: Path, target_dir: Path, skip_backup: bool = False
) -> str:
    """Extract a ZIP archive into target_dir using a temporary sibling directory.

    Only .txt files are extracted; all other members are skipped.
    Extracted .txt files are placed directly in target_dir (flattened).

    When skip_backup is True the source archive is left in place after extraction
    (for re-extracting from an already-backed-up archive).
    """
    try:
        temp_dir = Path(
            tempfile.mkdtemp(prefix=f"{archive_path.stem}.", suffix=".tmp", dir=target_dir)
        )
    except Exception:
        return "archive_error_filesystem"

    published_paths: List[Path] = []

    try:
        with zipfile.ZipFile(archive_path) as archive:
            seen_output_names = set()
            for member in archive.infolist():
                if member.is_dir():
                    continue
                decoded_name = _decode_zip_member_name(member)
                if not decoded_name.lower().endswith(".txt"):
                    continue
                flat_name = Path(decoded_name).name
                if flat_name in seen_output_names:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    return "archive_skipped_target_conflict"
                seen_output_names.add(flat_name)

                final_destination = _safe_member_destination(target_dir, flat_name)
                if final_destination.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    return "archive_skipped_target_conflict"

                staged_destination = _safe_member_destination(temp_dir, flat_name)
                staged_destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, open(staged_destination, "wb") as output:
                    shutil.copyfileobj(source, output)
    except UnicodeEncodeError:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return "archive_error_bad_encoding"
    except ValueError:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return "archive_error_unsafe_path"
    except zipfile.BadZipFile:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return "archive_error_bad_zip"
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return "archive_error_filesystem"

    try:
        for staged_file in sorted(temp_dir.iterdir()):
            final_destination = _safe_member_destination(target_dir, staged_file.name)
            staged_file.rename(final_destination)
            published_paths.append(final_destination)
        if not skip_backup:
            _archive_backup_dir(archive_path).mkdir(parents=True, exist_ok=True)
            archive_path.rename(_archive_backup_path(archive_path))
        shutil.rmtree(temp_dir, ignore_errors=True)
        return "archive_extracted_zip"
    except Exception:
        for published_path in published_paths:
            try:
                if published_path.exists():
                    published_path.unlink()
            except Exception:
                logger.exception("Failed to clean extracted file after publish error: %s", published_path)
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
        return "archive_error_filesystem"


async def prepare_archives(library_path: Path) -> List[Dict[str, Any]]:
    """Prepare archive work items for scanning."""
    results = []

    for archive_path in find_archives(library_path):
        backup_path = _archive_backup_path(archive_path)

        if backup_path.exists():
            status = "archive_skipped_backup_exists"
        elif archive_path.suffix.lower() == ".zip":
            target_dir = _archive_extract_dir(archive_path)
            status = await asyncio.to_thread(_extract_zip_archive, archive_path, target_dir)
        elif archive_path.suffix.lower() == ".rar":
            status = "archive_error_rar_unsupported"
        else:
            status = "archive_error_unsupported_archive"

        results.append({"archive_path": archive_path, "status": status})

    # Re-extract orphaned backups: a zip was previously extracted and moved to
    # bak/, but its target directory has since been deleted.
    for bak_dir in sorted(library_path.rglob("bak")):
        if not bak_dir.is_dir():
            continue
        for archive_path in sorted(bak_dir.iterdir()):
            if not archive_path.is_file() or archive_path.suffix.lower() != ".zip":
                continue
            # Reconstruct the original archive location: it was a sibling of bak/
            original_archive = bak_dir.parent / archive_path.name
            target_dir = _archive_extract_dir(original_archive)

            if original_archive.exists():
                continue

            try:
                output_names = await asyncio.to_thread(_zip_txt_output_names, archive_path)
            except Exception:
                output_names = []

            if output_names:
                output_paths = [target_dir / name for name in output_names]
                if all(path.is_file() for path in output_paths):
                    continue
                if any(path.exists() for path in output_paths):
                    continue

            if target_dir.is_file():
                continue

            status = await asyncio.to_thread(
                _extract_zip_archive, archive_path, target_dir, skip_backup=True
            )
            results.append({"archive_path": original_archive, "status": status})

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
            select(Book).where(Book.file_path == str(file_path))
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
            converted, convert_msg, _original_md5 = await convert_to_utf8(
                file_path, aggressive=True
            )
            is_converted = converted
            if converted:
                # Move the .txt.bak backup created by convert_to_utf8 to bak/
                bak_path = file_path.with_suffix('.txt.bak')
                if bak_path.exists():
                    bak_dir = file_path.parent / "bak"
                    await asyncio.to_thread(bak_dir.mkdir, parents=True, exist_ok=True)
                    await asyncio.to_thread(
                        shutil.move, str(bak_path), str(bak_dir / bak_path.name)
                    )
                stat = await asyncio.to_thread(os.stat, file_path)
                file_size = stat.st_size
                mtime = datetime.fromtimestamp(stat.st_mtime)
                logger.info(f"Converted {filename} from {encoding} to UTF-8")
            else:
                logger.warning(f"Failed to convert {filename}: {convert_msg}")

        # Extract chapters and compute content MD5 from current file content
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

    archive_results = await prepare_archives(library_path)

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
        "archives_found": len(archive_results),
        "archives_extracted": sum(1 for r in archive_results if "extracted" in r["status"]),
        "archives_skipped": sum(1 for r in archive_results if "skipped" in r["status"]),
        "archive_errors": sum(1 for r in archive_results if "error" in r["status"]),
        "archive_details": archive_results,
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
