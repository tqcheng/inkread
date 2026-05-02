"""Database configuration and session management."""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy import text

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
    await init_fts_tables(engine)


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
                INSERT INTO books_fts(books_fts, rowid, title) VALUES('delete', old.id, old.title);
            END;
        """)
        )

        await conn.execute(
            text("""
            CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
                INSERT INTO books_fts(books_fts, rowid, title) VALUES('delete', old.id, old.title);
                INSERT INTO books_fts(rowid, title) VALUES (new.id, new.title);
            END;
        """)
        )
