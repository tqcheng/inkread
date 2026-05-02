#!/usr/bin/env python3
"""Simple test runner for verification."""

import subprocess
import sys

def main():
    print("=" * 60)
    print("Running File Scanning & Encoding Service Tests")
    print("=" * 60)
    print()
    
    # Run encoding tests
    print("Running encoding tests...")
    result = subprocess.run(
        ["python", "-m", "pytest", "backend/tests/test_encoding.py", "-v", "--tb=short"],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("✓ All encoding tests passed!")
    else:
        print("✗ Some encoding tests failed")
        print(result.stdout[-1000:] if len(result.stdout) > 1000 else result.stdout)
    
    print()
    
    # Run scanner tests
    print("Running scanner tests...")
    result = subprocess.run(
        ["python", "-m", "pytest", "backend/tests/test_scanner.py", "-v", "--tb=short"],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("✓ All scanner tests passed!")
    else:
        print("✗ Some scanner tests failed")
        print(result.stdout[-1000:] if len(result.stdout) > 1000 else result.stdout)
    
    print()
    print("=" * 60)
    print("Test run completed!")
    print("=" * 60)

if __name__ == "__main__":
    main()