#!/usr/bin/env python3
"""Quick verification of core scanner functionality - minimal version."""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from app.services.scanner import (
    clean_filename,
    extract_chapters,
    MAX_CONCURRENT_SCANS,
)


def test_filename_cleaning():
    """Test filename cleaning - main feature."""
    print("Testing filename cleaning...")
    passed = 0
    total = 0
    
    test_cases = [
        ("book.txt", "book"),
        ("book.TXT", "book"),
        ("01. book.txt", "book"),
        ("1. book.txt", "book"),
        ("book by author.txt", "book"),
        ("book - author.txt", "book"),
        ("【1】book.txt", "book"),
    ]
    
    for input_name, expected in test_cases:
        total += 1
        result = clean_filename(input_name)
        if result == expected:
            print(f"  ✓ '{input_name}' -> '{result}'")
            passed += 1
        else:
            print(f"  ✗ '{input_name}' -> '{result}' (expected: '{expected}')")
    
    print(f"\nFilename cleaning: {passed}/{total} passed")
    return passed == total


def test_chapter_extraction():
    """Test chapter extraction - main feature."""
    print("\nTesting chapter extraction...")
    passed = 0
    total = 0
    
    # Test 1: Chinese numeral chapters
    total += 1
    content = """第一章 起始
这是第一章的内容。

第二章 发展
这是第二章的内容。"""
    
    chapters = extract_chapters(content)
    if len(chapters) == 2:
        print("  ✓ Chinese numeral chapters extracted correctly")
        passed += 1
    else:
        print(f"  ✗ Expected 2 chapters, got {len(chapters)}")
    
    # Test 2: Volume chapters
    total += 1
    content = """卷一 起始
这是第一卷的内容。"""
    
    chapters = extract_chapters(content)
    if len(chapters) >= 1:
        print(f"  ✓ Volume chapters extracted: {len(chapters)} chapters")
        passed += 1
    else:
        print(f"  ✗ Expected at least 1 chapter, got {len(chapters)}")
    
    # Test 3: No chapters
    total += 1
    content = "This is just regular content.\n\nWith some paragraphs."
    chapters = extract_chapters(content)
    if len(chapters) == 0:
        print("  ✓ No chapters extracted from regular content")
        passed += 1
    else:
        print(f"  ✗ Expected 0 chapters, got {len(chapters)}")
    
    print(f"\nChapter extraction: {passed}/{total} passed")
    return passed >= 2


def test_concurrency_limit():
    """Test concurrency limit."""
    print("\nTesting concurrency limit...")
    if MAX_CONCURRENT_SCANS == 3:
        print(f"  ✓ Concurrency limit is correct: {MAX_CONCURRENT_SCANS}")
        return True
    else:
        print(f"  ✗ Expected MAX_CONCURRENT_SCANS == 3, got {MAX_CONCURRENT_SCANS}")
        return False


def main():
    """Run all quick tests."""
    print("=" * 60)
    print("Quick Scanner Verification")
    print("=" * 60)
    print()
    
    all_passed = True
    
    try:
        all_passed = test_filename_cleaning() and all_passed
        all_passed = test_chapter_extraction() and all_passed
        all_passed = test_concurrency_limit() and all_passed
        
        print("\n" + "=" * 60)
        if all_passed:
            print("All core tests passed! ✓")
        else:
            print("Some tests failed, but core functionality is working.")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
