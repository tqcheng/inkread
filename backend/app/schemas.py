"""Pydantic v2 schemas for API request/response models."""

from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict


# ============== Book Schemas ==============


class BookBase(BaseModel):
    """Base book schema with common fields."""

    title: str
    filename: str
    file_path: str
    file_size: Optional[int] = None


class BookCreate(BookBase):
    """Schema for creating a new book."""

    category: Optional[str] = None
    category_confidence: Optional[float] = None
    tags: Optional[List[str]] = None
    tags_source: Optional[str] = None
    encoding_original: Optional[str] = None
    is_utf8_converted: bool = False


class BookUpdate(BaseModel):
    """Schema for updating book metadata (admin manual correction)."""

    title: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    tags_source: Optional[str] = "manual"
    is_favorite: Optional[bool] = None
    is_deleted: Optional[bool] = None
    last_read_position: Optional[int] = None
    last_read_chapter: Optional[str] = None


class BookResponse(BookBase):
    """Schema for book response with all fields."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    category: Optional[str] = None
    category_confidence: Optional[float] = None
    tags: Optional[List[str]] = None
    tags_source: Optional[str] = None
    encoding_original: Optional[str] = None
    is_utf8_converted: bool = False
    created_at: datetime
    updated_at: datetime
    is_favorite: bool = False
    is_deleted: bool = False
    last_read_position: int = 0
    last_read_chapter: Optional[str] = None
    ai_analyzed_at: Optional[datetime] = None
    chapters: List["ChapterResponse"] = []


class BookList(BaseModel):
    """Schema for paginated book list response."""

    model_config = ConfigDict(from_attributes=True)

    items: List[BookResponse]
    total: int
    page: int
    page_size: int
    pages: int


class BookFilter(BaseModel):
    """Schema for book filtering parameters."""

    category: Optional[str] = None
    tags: Optional[List[str]] = None
    search: Optional[str] = None
    is_favorite: Optional[bool] = None
    confidence_min: Optional[float] = None
    sort_by: str = "created_at"  # created_at, title, file_size, category_confidence
    sort_order: str = "desc"  # asc, desc
    page: int = 1
    page_size: int = 20


# ============== Chapter Schemas ==============


class ChapterBase(BaseModel):
    """Base chapter schema."""

    title: Optional[str] = None
    position_start: int
    position_end: Optional[int] = None
    chapter_index: Optional[int] = None


class ChapterCreate(ChapterBase):
    """Schema for creating a chapter."""

    book_id: int


class ChapterResponse(ChapterBase):
    """Schema for chapter response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    book_id: int


# ============== Reading Progress Schemas ==============


class ReadingSettings(BaseModel):
    """User reading preferences."""

    font_size: int = 18
    line_height: float = 1.8
    theme: str = "light"  # light, dark, sepia, eye-care
    margin_x: int = 24
    margin_y: int = 32


class ReadingProgressBase(BaseModel):
    """Base reading progress schema."""

    current_position: int
    current_chapter: Optional[str] = None
    reading_settings: Optional[ReadingSettings] = None


class ReadingProgressCreate(ReadingProgressBase):
    """Schema for creating reading progress."""

    book_id: int
    device_id: str


class ReadingProgressUpdate(BaseModel):
    """Schema for updating reading progress."""

    current_position: int
    current_chapter: Optional[str] = None
    reading_settings: Optional[ReadingSettings] = None


class ReadingProgressResponse(ReadingProgressBase):
    """Schema for reading progress response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    book_id: int
    device_id: str
    updated_at: datetime


# ============== AI Cache Schemas ==============


class AiCacheBase(BaseModel):
    """Base AI cache schema."""

    category: Optional[str] = None
    tags: Optional[List[str]] = None
    confidence: Optional[float] = None


class AiCacheCreate(AiCacheBase):
    """Schema for creating AI cache entry."""

    file_hash: str


class AiCacheResponse(AiCacheBase):
    """Schema for AI cache response."""

    model_config = ConfigDict(from_attributes=True)

    file_hash: str
    created_at: datetime


# ============== Settings Schemas ==============


class SettingsBase(BaseModel):
    """Base settings schema."""

    key: str
    value: Optional[str] = None


class SettingsCreate(SettingsBase):
    """Schema for creating a setting."""

    pass


class SettingsUpdate(BaseModel):
    """Schema for updating a setting value."""

    value: Optional[str] = None


class SettingsResponse(SettingsBase):
    """Schema for settings response."""

    model_config = ConfigDict(from_attributes=True)

    updated_at: datetime


# ============== Scan / Admin Schemas ==============


class ScanRequest(BaseModel):
    """Request to trigger a folder scan."""

    path: Optional[str] = None  # Use default if not provided
    force_rescan: bool = False


class ScanResponse(BaseModel):
    """Response from scan initiation."""

    task_id: str
    status: str
    message: str


class BatchDeleteRequest(BaseModel):
    """Request to batch delete books (admin only)."""

    ids: List[int]
    permanent: bool = False  # If True, hard delete; else soft delete


class BookMetadataUpdate(BaseModel):
    """Request to manually update book metadata (admin)."""

    category: Optional[str] = None
    tags: Optional[List[str]] = None
    tags_source: str = "manual"


class AdminBatchDeleteRequest(BaseModel):
    """Request for admin batch delete."""

    ids: List[int]
    permanent: bool = False


class ErrorResponse(BaseModel):
    """Standard error response format."""

    error: str
    message: str
    details: Optional[dict] = None


# ============== Content Response Schema ==============


class BookContentResponse(BaseModel):
    """Response for book content retrieval."""

    book_id: int
    content: str
    next_offset: Optional[int] = None
    is_end: bool = False


# ============== Auth Schemas ==============


class AuthStatusResponse(BaseModel):
    """App password protection status."""

    enabled: bool
    has_password: bool


class AuthLoginRequest(BaseModel):
    """Request to login with app password."""

    password: str


class AuthLoginResponse(BaseModel):
    """Response with auth token."""

    token: str


class SecuritySettingsRequest(BaseModel):
    """Request to update security settings (admin only)."""

    enabled: bool
    current_password: Optional[str] = None
    new_password: Optional[str] = None


# ============== Search Schemas ==============


class BookSearchResult(BaseModel):
    """Single search result within a book."""

    offset: int
    context: str
    position_percent: int


class BookSearchResponse(BaseModel):
    """Response for book content search."""

    book_id: int
    query: str
    results: List[BookSearchResult]
