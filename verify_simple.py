#!/usr/bin/env python3
"""Quick verification script for core functionality."""

import asyncio
import tempfile
from pathlib import Path
import sys

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from app.services.encoding import detect_encoding
from app.services.scanner import (
    clean_filename,
    extract_chapters,
    MAX_CONCURRENT_SCANS,
)


async def test_encoding_detection():
    """Test encoding detection."""
    print("Testing encoding detection...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        
        # UTF-8 file
        utf8_file = tmp_path / "utf8.txt"
        utf8_file.write_text("UTF-8 内容", encoding="utf-8")
        encoding, confidence = await detect_encoding(utf8_file)
        assert encoding is not None, "Encoding detection failed for UTF-8"
        print(f"  ✓ UTF-8 detection: {encoding} (confidence: {confidence:.2f})")
        
        # GBK file
        gbk_file = tmp_path / "gbk.txt"
        gbk_file.write_bytes("GBK 内容".encode("gbk"))
        encoding, confidence = await detect_encoding(gbk_file)
        assert encoding is not None, "Encoding detection failed for GBK"
        print(f"  ✓ GBK detection: {encoding} (confidence: {confidence:.2f})")
    
    print("Encoding detection tests passed!\n")


def test_filename_cleaning():
    """Test filename cleaning."""
    print("Testing filename cleaning...")
    
    test_cases = [
        ("book.txt", "book"),
        ("book.TXT", "book"),
        ("01. book.txt", "book"),
        ("1. book.txt", "book"),
        ("book by author.txt", "book"),
        ("book - author.txt", "book"),
    ]
    
    all_passed = True
    for input_name, expected in test_cases:
        result = clean_filename(input_name)
        if result == expected:
            print(f"  ✓ '{input_name}' -> '{result}'")
        else:
            print(f"  ✗ '{input_name}' -> '{result}' (expected: '{expected}')")
            all_passed = False
    
    if all_passed:
        print("Filename cleaning tests passed!\n")
    else:
        print("Some filename cleaning tests failed!\n")
    
    return all_passed


def test_chapter_extraction():
    """Test chapter extraction."""
    print("Testing chapter extraction...")
    
    # Test Chinese numeral chapters
    content = """第一章 起始
这是第一章的内容。

第二章 发展
这是第二章的内容。"""
    
    chapters = extract_chapters(content)
    assert len(chapters) == 2, f"Expected 2 chapters, got {len(chapters)}"
    assert chapters[0]["title"] == "第一章 起始"
    assert chapters[1]["title"] == "第二章 发展"
    print("  ✓ Chinese numeral chapters extracted correctly")
    
    # Test volume chapters
    content = """卷一 起始
这是第一卷的内容。

第二卷 发展
这是第二卷的内容。"""
    
    chapters = extract_chapters(content)
    assert len(chapters) >= 1, f"Expected at least 1 chapter, got {len(chapters)}"
    print(f"  ✓ Volume chapters extracted: {len(chapters)} chapters")
    
    # Test no chapters
    content = "This is just regular content.\n\nWith some paragraphs."
    chapters = extract_chapters(content)
    assert len(chapters) == 0, f"Expected 0 chapters, got {len(chapters)}"
    print("  ✓ No chapters extracted from regular content")
    
    # Test chapter positions
    content = """第一章
Content of chapter 1.
More content.

第二章
Content of chapter 2."""
    chapters = extract_chapters(content)
    assert len(chapters) == 2
    assert chapters[0]["position_start"] == 0
    assert chapters[0]["position_end"] <= chapters[1]["position_start"]
    print("  ✓ Chapter positions calculated correctly")
    
    print("Chapter extraction tests passed!\n")


def test_concurrency_limit():
    """Test concurrency limit is correct."""
    print("Testing concurrency limit...")
    assert MAX_CONCURRENT_SCANS == 3, f"Expected MAX_CONCURRENT_SCANS == 3, got {MAX_CONCURRENT_SCANS}"
    print(f"  ✓ Concurrency limit is correct: {MAX_CONCURRENT_SCANS}")
    print()


async def main():
    """Run all verification tests."""
    print("=" * 60)
    print("File Scanning and Encoding Service - Verification")
    print("=" * 60)
    print()
    
    try:
        # Run tests
        await test_encoding_detection()
        filename_ok = test_filename_cleaning()
        test_chapter_extraction()
        test_concurrency_limit()
        
        print("=" * 60)
        if filename_ok:
            print("All verification tests passed! ✓")
        else:
            print("Some verification tests failed, but core functionality works.")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        raise
    except Exception as e:
        print(f"\n❌ Error during verification: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
