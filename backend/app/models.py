"""SQLAlchemy ORM models for TXT Reader."""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Integer,
    String,
    Boolean,
    DateTime,
    Float,
    JSON,
    Text,
    BigInteger,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Book(Base):
    """Book metadata and AI classification."""

    __tablename__ = "books"
    __table_args__ = (Index("ix_books_content_md5", "content_md5"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    content_md5: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    file_mtime: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    dedup_ignored_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

    # AI classification fields
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    category_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tags: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    tags_source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Encoding information
    encoding_original: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_utf8_converted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Reading state
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    last_read_position: Mapped[int] = mapped_column(Integer, default=0)
    last_read_chapter: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # AI analysis timestamp
    ai_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    chapters: Mapped[List["Chapter"]] = relationship(
        "Chapter", back_populates="book", cascade="all, delete-orphan"
    )
    reading_progress: Mapped[List["ReadingProgress"]] = relationship(
        "ReadingProgress", back_populates="book", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Book(id={self.id}, title='{self.title}')>"


class Chapter(Base):
    """Chapter metadata extracted from book content."""

    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    position_start: Mapped[int] = mapped_column(BigInteger, nullable=False)
    position_end: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    chapter_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relationship
    book: Mapped["Book"] = relationship("Book", back_populates="chapters")

    def __repr__(self) -> str:
        return f"<Chapter(id={self.id}, title='{self.title}', book_id={self.book_id})>"


class ReadingProgress(Base):
    """Reading progress synced across devices."""

    __tablename__ = "reading_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[str] = mapped_column(String(100), nullable=False)
    current_position: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_chapter: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reading_settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationship
    book: Mapped["Book"] = relationship("Book", back_populates="reading_progress")

    # Unique constraint for device + book combination
    __table_args__ = (
        UniqueConstraint('book_id', 'device_id', name='uq_reading_progress_book_device'),
    )

    def __repr__(self) -> str:
        return f"<ReadingProgress(book_id={self.book_id}, device_id='{self.device_id}')>"


class Settings(Base):
    """System settings key-value store."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<Settings(key='{self.key}')>"


class AiCache(Base):
    """AI classification cache based on file content hash."""

    __tablename__ = "ai_cache"

    file_hash: Mapped[str] = mapped_column(String(32), primary_key=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tags: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<AiCache(file_hash='{self.file_hash[:8]}...', category='{self.category}')>"
