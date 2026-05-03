"""Encoding detection and conversion service."""

import asyncio
import logging
import os
from pathlib import Path
from typing import Tuple, Optional, List

import aiofiles
import chardet

logger = logging.getLogger(__name__)

# Configuration constants
CONFIDENCE_THRESHOLD = 0.8
MAX_DETECT_BYTES = 10000  # Read first 10KB for detection


async def detect_encoding(file_path: Path) -> Tuple[Optional[str], float]:
    """
    Detect file encoding using chardet.
    
    Args:
        file_path: Path to the file to detect
        
    Returns:
        Tuple of (encoding, confidence)
        encoding is None if detection fails
    """
    try:
        # Read first N bytes for detection
        async with aiofiles.open(file_path, 'rb') as f:
            raw_data = await f.read(MAX_DETECT_BYTES)
        
        if not raw_data:
            logger.warning(f"Empty file: {file_path}")
            return None, 0.0
        
        # Use chardet for detection
        result = chardet.detect(raw_data)
        encoding = result.get('encoding')
        confidence = result.get('confidence', 0.0)
        
        # Normalize encoding names
        if encoding:
            encoding = encoding.upper().replace('-', '_')
            # Map common aliases
            encoding_map = {
                'UTF_8': 'UTF-8',
                'UTF8': 'UTF-8',
                'ASCII': 'ASCII',
                'GB2312': 'GBK',
                'GB_2312': 'GBK',
                'GB18030': 'GBK',
                'BIG5': 'Big5',
                'BIG5_HKSCS': 'Big5',
                'ISO_8859_1': 'ISO-8859-1',
                'WINDOWS_1252': 'cp1252',
            }
            encoding = encoding_map.get(encoding, encoding)
        
        logger.debug(f"Detected encoding for {file_path.name}: {encoding} (confidence: {confidence:.2f})")
        return encoding, confidence
        
    except Exception as e:
        logger.error(f"Error detecting encoding for {file_path}: {e}")
        return None, 0.0


async def _try_decode(raw_data: bytes, encoding: str) -> Tuple[str, int]:
    """
    Try to decode bytes with given encoding.

    Args:
        raw_data: Raw byte data
        encoding: Encoding to try

    Returns:
        Tuple of (decoded_content, error_count)
    """
    try:
        content = raw_data.decode(encoding, errors='replace')
        error_count = content.count('\ufffd')
        return content, error_count
    except Exception:
        return "", float('inf')


async def convert_to_utf8(
    file_path: Path,
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
    aggressive: bool = False,
) -> Tuple[bool, str]:
    """
    Convert file encoding to UTF-8.

    Creates a backup with .txt.bak extension before conversion.
    When aggressive=True, tries fallback encodings even if confidence is low.

    Args:
        file_path: Path to the file to convert
        confidence_threshold: Minimum confidence for conversion
        aggressive: If True, try common fallback encodings when confidence is low

    Returns:
        Tuple of (success, message)
        - success: True if converted or already UTF-8
        - message: Description of what happened
    """
    try:
        # Detect current encoding
        encoding, confidence = await detect_encoding(file_path)

        if not encoding:
            return False, "encoding_detection_failed"

        # Check if already UTF-8
        if encoding.upper() in ('UTF-8', 'UTF8', 'ASCII'):
            logger.debug(f"File already in UTF-8: {file_path}")
            return False, "already_utf8"

        # Read raw data
        try:
            async with aiofiles.open(file_path, 'rb') as f:
                raw_data = await f.read()
        except Exception as e:
            logger.error(f"Failed to read file: {e}")
            return False, "read_error"

        if not raw_data:
            logger.warning(f"Empty file: {file_path}")
            return False, "empty_content"

        # Determine which encodings to try
        encodings_to_try: List[str] = []

        if confidence >= confidence_threshold:
            encodings_to_try.append(encoding)
        elif aggressive:
            # Try detected encoding first, then fallbacks
            encodings_to_try.append(encoding)
            fallbacks = ['GBK', 'Big5', 'GB18030', 'cp1252', 'ISO-8859-1']
            for fb in fallbacks:
                if fb != encoding:
                    encodings_to_try.append(fb)
        else:
            logger.warning(
                f"Low confidence ({confidence:.2f} < {confidence_threshold}) for {file_path}, "
                "skipping conversion"
            )
            return False, f"low_confidence_{confidence:.2f}"

        # Try each encoding and pick the best one (fewest replacement chars)
        best_content = ""
        best_encoding = ""
        best_errors = float('inf')

        for enc in encodings_to_try:
            content, error_count = await _try_decode(raw_data, enc)
            if content and error_count < best_errors:
                best_content = content
                best_encoding = enc
                best_errors = error_count
                if error_count == 0:
                    break

        if not best_content:
            logger.error(f"Failed to decode {file_path} with any encoding")
            return False, "decode_failed"

        if best_errors > 0:
            logger.warning(
                f"Decoded {file_path.name} with {best_encoding} but had {best_errors} replacement characters"
            )

        # Create backup
        backup_path = file_path.with_suffix('.txt.bak')
        try:
            # Remove existing backup if present
            if await asyncio.to_thread(os.path.exists, backup_path):
                await asyncio.to_thread(os.remove, backup_path)
            await asyncio.to_thread(os.rename, file_path, backup_path)
            logger.debug(f"Created backup: {backup_path}")
        except Exception as e:
            logger.error(f"Failed to create backup: {e}")
            return False, "backup_failed"

        # Write UTF-8 content
        try:
            async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
                await f.write(best_content)
            logger.info(f"Converted to UTF-8: {file_path.name} (from {best_encoding})")
            return True, f"converted_{best_encoding}_to_utf8"
        except Exception as e:
            # Attempt to restore backup
            logger.error(f"Failed to write UTF-8 file: {e}")
            try:
                await asyncio.to_thread(os.rename, backup_path, file_path)
                logger.info(f"Restored backup for: {file_path}")
            except Exception as restore_error:
                logger.error(f"Failed to restore backup: {restore_error}")
            return False, "write_error"

    except Exception as e:
        logger.exception(f"Unexpected error converting {file_path}: {e}")
        return False, f"unexpected_error_{type(e).__name__}"


async def get_file_info(file_path: Path) -> dict:
    """
    Get file information including encoding details.
    
    Args:
        file_path: Path to the file
        
    Returns:
        Dictionary with file information
    """
    try:
        stat = await asyncio.to_thread(os.stat, file_path)
        encoding, confidence = await detect_encoding(file_path)
        
        return {
            "path": str(file_path),
            "name": file_path.name,
            "size": stat.st_size,
            "mtime": stat.st_mtime,
            "encoding": encoding,
            "encoding_confidence": confidence,
            "is_utf8": encoding and encoding.upper() in ('UTF-8', 'UTF8', 'ASCII'),
        }
    except Exception as e:
        logger.error(f"Error getting file info for {file_path}: {e}")
        return {
            "path": str(file_path),
            "name": file_path.name,
            "error": str(e),
        }
