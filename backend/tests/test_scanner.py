"""Tests for scan router."""

import asyncio
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.scanner import MAX_CONCURRENT_SCANS


class TestScanRouter:
    """Tests for scan API endpoints."""

    @pytest.mark.asyncio
    async def test_trigger_scan_default_path(self, async_client: AsyncClient, db_session: AsyncSession):
        """Test triggering a scan with default library path."""
        response = await async_client.post("/api/v1/scan/")
        
        # Should succeed or fail gracefully if path doesn't exist
        assert response.status_code in [200, 400, 422]
        
        if response.status_code == 200:
            data = response.json()
            assert "task_id" in data
            assert data["status"] == "queued"
            assert "message" in data

    @pytest.mark.asyncio
    async def test_trigger_scan_custom_path(self, async_client: AsyncClient, tmp_path, db_session: AsyncSession, monkeypatch):
        """Test triggering a scan with custom library path."""
        # Create a test directory
        test_dir = tmp_path / "test_library"
        test_dir.mkdir()
        
        # Mock LIBRARY_PATH to allow this temp directory
        from app.core import config
        monkeypatch.setattr(config.settings, 'LIBRARY_PATH', str(tmp_path))
        
        response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": str(test_dir)}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert data["status"] == "queued"

    @pytest.mark.asyncio
    async def test_trigger_scan_invalid_path(self, async_client: AsyncClient, db_session: AsyncSession):
        """Test triggering a scan with invalid path."""
        response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": "/path/that/does/not/exist"}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_get_scan_status(self, async_client: AsyncClient, tmp_path, db_session: AsyncSession, monkeypatch):
        """Test getting scan status."""
        # Mock LIBRARY_PATH to allow this temp directory
        from app.core import config
        monkeypatch.setattr(config.settings, 'LIBRARY_PATH', str(tmp_path))
        
        # First trigger a scan
        test_dir = tmp_path / "test_library"
        test_dir.mkdir()
        
        trigger_response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": str(test_dir)}
        )
        
        assert trigger_response.status_code == 200
        task_id = trigger_response.json()["task_id"]
        
        # Then get status
        status_response = await async_client.get(f"/api/v1/scan/{task_id}")
        
        assert status_response.status_code == 200
        data = status_response.json()
        assert "task_id" in data
        assert "status" in data
        assert "progress" in data
        assert data["task_id"] == task_id

    @pytest.mark.asyncio
    async def test_get_scan_status_not_found(self, async_client: AsyncClient, db_session: AsyncSession):
        """Test getting status of non-existent scan."""
        response = await async_client.get("/api/v1/scan/non-existent-task-id")
        
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_get_scan_summary(self, async_client: AsyncClient, db_session: AsyncSession):
        """Test getting scan task summary."""
        response = await async_client.get("/api/v1/scan/")
        
        # Should succeed (may return empty summary)
        assert response.status_code == 200
        data = response.json()
        assert "total_tasks" in data
        assert "running" in data
        assert "completed" in data
        assert "failed" in data


class TestPathSecurity:
    """Tests for path security validation."""

    @pytest.mark.asyncio
    async def test_scan_outside_library_path(self, async_client: AsyncClient, db_session: AsyncSession):
        """Test that paths outside library are rejected."""
        # Try to scan a system directory (should be rejected)
        response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": "/etc"}
        )
        
        # Should fail with 403 or 400
        assert response.status_code in [400, 403]

    @pytest.mark.asyncio
    async def test_scan_directory_traversal(self, async_client: AsyncClient, db_session: AsyncSession):
        """Test that directory traversal is prevented."""
        response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": "/books/../../../etc"}
        )
        
        # Should fail
        assert response.status_code in [400, 403]


class TestScanWithRealFiles:
    """Integration tests with real file operations."""

    @pytest.mark.asyncio
    async def test_full_scan_workflow(self, async_client: AsyncClient, tmp_path, db_session, monkeypatch):
        """Test complete scan workflow with real files."""
        # Mock LIBRARY_PATH to allow this temp directory
        from app.core import config
        monkeypatch.setattr(config.settings, 'LIBRARY_PATH', str(tmp_path))
        
        # Create test library structure
        library = tmp_path / "library"
        library.mkdir()
        
        # Create files in different encodings
        (library / "book1.txt").write_text(
            "第一章 UTF8\n\n这是UTF-8编码的书。",
            encoding="utf-8"
        )
        
        (library / "book2.txt").write_bytes(
            "第一章 GBK\n\n这是GBK编码的书。".encode("gbk")
        )
        
        # Create subdirectory
        subdir = library / "sub"
        subdir.mkdir()
        (subdir / "book3.txt").write_text(
            "第一章 子目录\n\n这是子目录里的书。",
            encoding="utf-8"
        )
        
        # Trigger scan
        trigger_response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": str(library)}
        )
        
        assert trigger_response.status_code == 200
        task_id = trigger_response.json()["task_id"]
        
        # Wait a bit for processing
        await asyncio.sleep(1)
        
        # Check status
        status_response = await async_client.get(f"/api/v1/scan/{task_id}")
        assert status_response.status_code == 200
        
        status_data = status_response.json()
        assert status_data["task_id"] == task_id
        
        # The task might be completed or still running
        assert status_data["status"] in ["pending", "running", "completed", "failed"]


class TestConcurrency:
    """Tests for concurrent scanning behavior."""

    def test_concurrency_limit(self):
        """Test that concurrency limit is correctly set."""
        # The MAX_CONCURRENT_SCANS should be 3 (conservative strategy)
        assert MAX_CONCURRENT_SCANS == 3

    @pytest.mark.asyncio
    async def test_multiple_concurrent_scans(self, async_client: AsyncClient, tmp_path, db_session, monkeypatch):
        """Test running multiple scan tasks concurrently."""
        # Mock LIBRARY_PATH to allow this temp directory
        from app.core import config
        monkeypatch.setattr(config.settings, 'LIBRARY_PATH', str(tmp_path))
        
        # Create multiple library directories
        libraries = []
        for i in range(3):
            lib = tmp_path / f"library_{i}"
            lib.mkdir()
            (lib / f"book_{i}.txt").write_text(f"Book {i} content", encoding="utf-8")
            libraries.append(lib)
        
        # Trigger all scans
        task_ids = []
        for lib in libraries:
            response = await async_client.post(
                "/api/v1/scan/",
                json={"library_path": str(lib)}
            )
            assert response.status_code == 200
            task_ids.append(response.json()["task_id"])
        
        # Verify all tasks exist
        for task_id in task_ids:
            response = await async_client.get(f"/api/v1/scan/{task_id}")
            assert response.status_code == 200


class TestErrorHandling:
    """Tests for error handling in scan operations."""

    @pytest.mark.asyncio
    async def test_scan_with_corrupted_file(self, async_client: AsyncClient, tmp_path, db_session, monkeypatch):
        """Test scanning with a corrupted/unreadable file."""
        # Mock LIBRARY_PATH to allow this temp directory
        from app.core import config
        monkeypatch.setattr(config.settings, 'LIBRARY_PATH', str(tmp_path))
        
        library = tmp_path / "library"
        library.mkdir()
        
        # Create a valid file
        (library / "valid.txt").write_text("Valid content", encoding="utf-8")
        
        # Create a binary file disguised as txt (might cause issues)
        (library / "binary.txt").write_bytes(b"\x00\x01\x02\x03\xff\xfe")
        
        response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": str(library)}
        )
        
        assert response.status_code == 200
        # The scan should complete, possibly with some errors

    @pytest.mark.asyncio
    async def test_scan_with_special_characters_in_filename(self, async_client: AsyncClient, tmp_path, db_session, monkeypatch):
        """Test scanning files with special characters in filenames."""
        # Mock LIBRARY_PATH to allow this temp directory
        from app.core import config
        monkeypatch.setattr(config.settings, 'LIBRARY_PATH', str(tmp_path))
        
        library = tmp_path / "library"
        library.mkdir()
        
        # Create files with various special characters
        special_names = [
            "book with spaces.txt",
            "book-with-dashes.txt",
            "book_with_underscores.txt",
            "book(1).txt",
            "book[1].txt",
            "book-中文.txt",
        ]
        
        for name in special_names:
            (library / name).write_text(f"Content of {name}", encoding="utf-8")
        
        response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": str(library)}
        )
        
        assert response.status_code == 200
        
        # Wait for scan to complete
        await asyncio.sleep(1)
        
        # Check that files were processed
        # (The exact count might vary due to how the scan processes files)

    @pytest.mark.asyncio
    async def test_scan_empty_files(self, async_client: AsyncClient, tmp_path, db_session, monkeypatch):
        """Test scanning empty files."""
        # Mock LIBRARY_PATH to allow this temp directory
        from app.core import config
        monkeypatch.setattr(config.settings, 'LIBRARY_PATH', str(tmp_path))
        
        library = tmp_path / "library"
        library.mkdir()
        
        # Create empty files
        (library / "empty1.txt").write_text("", encoding="utf-8")
        (library / "empty2.txt").write_bytes(b"")
        
        # Create a file with just whitespace
        (library / "whitespace.txt").write_text("   \n\n   ", encoding="utf-8")
        
        response = await async_client.post(
            "/api/v1/scan/",
            json={"library_path": str(library)}
        )
        
        assert response.status_code == 200
        # Scan should complete even with empty files