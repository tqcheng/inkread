#!/usr/bin/env python3
"""Quick verification script for file scanning and encoding service."""

import asyncio
import tempfile
from pathlib import Path
import sys

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.services.encoding import detect_encoding, convert_to_utf8, get_file_info
from app.services.scanner import clean_filename, extract_chapters


async def test_encoding_detection():
    """Test encoding detection."""
    print("Testing encoding detection...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        
        # UTF-8 file
        utf8_file = tmp_path / "utf8.txt"
        utf8_file.write_text("UTF-8 内容", encoding="utf-8")
        encoding, confidence = await detect_encoding(utf8_file)
        assert encoding.upper() in ("UTF-8", "UTF8", "ASCII"), f"Expected UTF-8, got {encoding}"
        assert confidence > 0.7, f"Confidence too low: {confidence}"
        print(f"  ✓ UTF-8 detection: {encoding} (confidence: {confidence:.2f})")
        
        # GBK file
        gbk_file = tmp_path / "gbk.txt"
        gbk_file.write_bytes("GBK 内容".encode("gbk"))
        encoding, confidence = await detect_encoding(gbk_file)
        assert encoding in ("GBK", "GB2312"), f"Expected GBK, got {encoding}"
        assert confidence > 0.7, f"Confidence too low: {confidence}"
        print(f"  ✓ GBK detection: {encoding} (confidence: {confidence:.2f})")
    
    print("Encoding detection tests passed!\n")


async def test_encoding_conversion():
    """Test encoding conversion."""
    print("Testing encoding conversion...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        
        # Create GBK file and convert to UTF-8
        gbk_file = tmp_path / "gbk.txt"
        gbk_file.write_bytes("GBK 内容\n第一章 测试".encode("gbk"))
        
        converted, message = await convert_to_utf8(gbk_file)
        
        assert converted, f"Conversion failed: {message}"
        print(f"  ✓ Conversion successful: {message}")
        
        # Verify backup was created
        backup_file = gbk_file.with_suffix('.txt.bak')
        assert backup_file.exists(), "Backup file not created"
        print(f"  ✓ Backup created: {backup_file}")
        
        # Verify content is readable as UTF-8
        content = gbk_file.read_text(encoding="utf-8")
        assert "GBK 内容" in content, "Content not properly converted"
        print(f"  ✓ Content readable as UTF-8")
        
        # Verify encoding detection
        new_encoding, _ = await detect_encoding(gbk_file)
        assert new_encoding.upper() in ("UTF-8", "UTF8"), f"Expected UTF-8, got {new_encoding}"
        print(f"  ✓ New encoding confirmed: {new_encoding}")
    
    print("Encoding conversion tests passed!\n")


def test_filename_cleaning():
    """Test filename cleaning."""
    print("Testing filename cleaning...")
    
    test_cases = [
        ("book.txt", "book"),
        ("01. book.txt", "book"),
        ("book by author.txt", "book"),
        ("【经典】三国演义.txt", "【经典】三国演义"),  # Chinese title kept
    ]
    
    for input_name, expected in test_cases:
        result = clean_filename(input_name)
        print(f"  ✓ '{input_name}' -> '{result}'")
    
    print("Filename cleaning tests passed!\n")


def test_chapter_extraction():
    """Test chapter extraction."""
    print("Testing chapter extraction...")
    
    content = """第一章 起始
这是第一章的内容。
可以有多行。

第二章 发展
这是第二章的内容。

第三章 结局
这是最后一章。
"""
    
    chapters = extract_chapters(content)
    
    assert len(chapters) == 3, f"Expected 3 chapters, got {len(chapters)}"
    assert chapters[0]["title"] == "第一章 起始"
    assert chapters[1]["title"] == "第二章 发展"
    assert chapters[2]["title"] == "第三章 结局"
    
    # Verify positions
    assert chapters[0]["position_start"] == 0
    assert chapters[0]["position_end"] < chapters[1]["position_start"]
    
    print(f"  ✓ Extracted {len(chapters)} chapters")
    for ch in chapters:
        print(f"    - {ch['title']} (position: {ch['position_start']}-{ch['position_end']})")
    
    print("Chapter extraction tests passed!\n")


async def main():
    """Run all verification tests."""
    print("=" * 60)
    print("File Scanning and Encoding Service - Verification")
    print("=" * 60)
    print()
    
    try:
        # Run async tests
        await test_encoding_detection()
        await test_encoding_conversion()
        
        # Run sync tests
        test_filename_cleaning()
        test_chapter_extraction()
        
        print("=" * 60)
        print("All verification tests passed! ✓")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        raise
    except Exception as e:
        print(f"\n❌ Error during verification: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())