"""Database configuration and session management."""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy import inspect, text

from app.core.config import settings

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# Declarative base for models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency injection function for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database by creating all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await ensure_book_dedup_columns(engine)
    await init_fts_tables(engine)


async def ensure_book_dedup_columns(engine) -> None:
    """Backfill dedup columns and index for preexisting books tables."""
    async with engine.begin() as conn:
        existing_columns = await conn.run_sync(
            lambda sync_conn: {
                col["name"] for col in inspect(sync_conn).get_columns("books")
            }
        )

        async def add_column(statement: str) -> None:
            try:
                await conn.execute(text(statement))
            except Exception as exc:
                message = str(exc).lower()
                if "duplicate column name" not in message and "already exists" not in message:
                    raise

        if "content_md5" not in existing_columns:
            await add_column("ALTER TABLE books ADD COLUMN content_md5 VARCHAR(32)")

        if "file_mtime" not in existing_columns:
            await add_column("ALTER TABLE books ADD COLUMN file_mtime DATETIME")

        if "dedup_ignored_at" not in existing_columns:
            await add_column("ALTER TABLE books ADD COLUMN dedup_ignored_at DATETIME")

        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_books_content_md5 ON books (content_md5)")
        )


async def init_fts_tables(engine) -> None:
    """Initialize FTS5 virtual tables and triggers."""
    async with engine.begin() as conn:
        await conn.execute(
            text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(title);
        """)
        )

        await conn.execute(
            text("""
            CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
                INSERT INTO books_fts(rowid, title) VALUES (new.id, new.title);
            END;
        """)
        )

        await conn.execute(
            text("""
            CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
                DELETE FROM books_fts WHERE rowid = old.id;
            END;
        """)
        )

        await conn.execute(
            text("""
            CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
                DELETE FROM books_fts WHERE rowid = old.id;
                INSERT INTO books_fts(rowid, title) VALUES (new.id, new.title);
            END;
        """)
        )
