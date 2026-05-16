"""Tests for serving built frontend assets from FastAPI."""

from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine
from httpx import ASGITransport, AsyncClient

import app.core.database as database
from app.main import create_app


@pytest_asyncio.fixture
async def frontend_client(tmp_path: Path):
    frontend_dir = tmp_path / "frontend"
    assets_dir = frontend_dir / "assets"
    assets_dir.mkdir(parents=True)
    (frontend_dir / "index.html").write_text(
        "<!doctype html><html><body><div id='root'>app</div></body></html>",
        encoding="utf-8",
    )
    (assets_dir / "app.js").write_text("console.log('ok')", encoding="utf-8")

    app = create_app(frontend_dist=frontend_dir)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_root_serves_frontend_index(frontend_client: AsyncClient):
    response = await frontend_client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<div id='root'>app</div>" in response.text


@pytest.mark.asyncio
async def test_spa_route_falls_back_to_frontend_index(frontend_client: AsyncClient):
    response = await frontend_client.get("/reader/8")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<div id='root'>app</div>" in response.text


@pytest.mark.asyncio
async def test_asset_request_uses_static_file(frontend_client: AsyncClient):
    response = await frontend_client.get("/assets/app.js")

    assert response.status_code == 200
    assert "console.log('ok')" in response.text


@pytest.mark.asyncio
async def test_init_db_adds_dedup_columns_for_existing_books_table(tmp_path: Path):
    db_path = tmp_path / "tmp_dedup_test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False, future=True)
    original_engine = database.engine

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    CREATE TABLE books (
                        id INTEGER PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        filename VARCHAR(255) NOT NULL UNIQUE,
                        file_path VARCHAR(500) NOT NULL,
                        file_size BIGINT,
                        category VARCHAR(50),
                        category_confidence FLOAT,
                        tags JSON,
                        tags_source VARCHAR(20),
                        encoding_original VARCHAR(20),
                        is_utf8_converted BOOLEAN,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        is_favorite BOOLEAN,
                        is_deleted BOOLEAN,
                        last_read_position INTEGER,
                        last_read_chapter VARCHAR(255),
                        ai_analyzed_at DATETIME
                    )
                    """
                )
            )

        database.engine = engine
        await database.init_db()

        async with engine.begin() as conn:
            columns = await conn.run_sync(
                lambda sync_conn: {
                    col["name"] for col in inspect(sync_conn).get_columns("books")
                }
            )
            indexes = await conn.run_sync(
                lambda sync_conn: {
                    index["name"] for index in inspect(sync_conn).get_indexes("books")
                }
            )

        assert "content_md5" in columns
        assert "file_mtime" in columns
        assert "dedup_ignored_at" in columns
        assert "ix_books_content_md5" in indexes
    finally:
        database.engine = original_engine
        await engine.dispose()


@pytest.mark.asyncio
async def test_init_db_migrates_books_to_unique_file_path(tmp_path: Path):
    db_path = tmp_path / "tmp_book_identity_test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False, future=True)
    original_engine = database.engine

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    CREATE TABLE books (
                        id INTEGER PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        filename VARCHAR(255) NOT NULL UNIQUE,
                        file_path VARCHAR(500) NOT NULL,
                        file_size BIGINT,
                        content_md5 VARCHAR(32),
                        file_mtime DATETIME,
                        dedup_ignored_at DATETIME,
                        category VARCHAR(50),
                        category_confidence FLOAT,
                        tags JSON,
                        tags_source VARCHAR(20),
                        encoding_original VARCHAR(20),
                        is_utf8_converted BOOLEAN,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        is_favorite BOOLEAN,
                        is_deleted BOOLEAN,
                        last_read_position INTEGER,
                        last_read_chapter VARCHAR(255),
                        ai_analyzed_at DATETIME
                    )
                    """
                )
            )
            await conn.execute(
                text(
                    """
                    INSERT INTO books (
                        id, title, filename, file_path, file_size, content_md5, file_mtime,
                        dedup_ignored_at, category, category_confidence, tags, tags_source,
                        encoding_original, is_utf8_converted, created_at, updated_at,
                        is_favorite, is_deleted, last_read_position, last_read_chapter, ai_analyzed_at
                    ) VALUES
                        (1, '卷一', 'chapter.txt', '/books/vol1/chapter.txt', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0, NULL, NULL)
                    """
                )
            )

        database.engine = engine
        await database.init_db()

        async with engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    INSERT INTO books (
                        id, title, filename, file_path, file_size, content_md5, file_mtime,
                        dedup_ignored_at, category, category_confidence, tags, tags_source,
                        encoding_original, is_utf8_converted, created_at, updated_at,
                        is_favorite, is_deleted, last_read_position, last_read_chapter, ai_analyzed_at
                    ) VALUES
                        (2, '卷二', 'chapter.txt', '/books/vol2/chapter.txt', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0, NULL, NULL)
                    """
                )
            )
            rows = (
                await conn.execute(text("SELECT filename, file_path FROM books ORDER BY id ASC"))
            ).fetchall()

        assert rows == [
            ("chapter.txt", "/books/vol1/chapter.txt"),
            ("chapter.txt", "/books/vol2/chapter.txt"),
        ]
    finally:
        database.engine = original_engine
        await engine.dispose()
