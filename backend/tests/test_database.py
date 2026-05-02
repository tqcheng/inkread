"""Database and configuration tests using pytest."""
import pytest
from sqlalchemy import inspect

from app.core.config import settings
from app.core.database import init_db, engine
from app.models import Book, Chapter, ReadingProgress, AiCache, Settings


class TestConfiguration:
    """Test configuration loading."""
    
    def test_ai_provider_default(self):
        """Test AI_PROVIDER defaults to 'disabled'."""
        assert settings.AI_PROVIDER == "disabled"
    
    def test_database_url_default(self):
        """Test DATABASE_URL default value."""
        assert settings.DATABASE_URL == "sqlite+aiosqlite:///./app.db"
    
    def test_library_path_default(self):
        """Test LIBRARY_PATH default value."""
        assert settings.LIBRARY_PATH == "/books"
    
    def test_ollama_model_default(self):
        """Test OLLAMA_MODEL default value."""
        assert settings.OLLAMA_MODEL == "qwen2.5:7b"


class TestBookModel:
    """Test Book model fields."""
    
    def test_book_has_category_confidence(self):
        """Test Book model has category_confidence field."""
        assert hasattr(Book, 'category_confidence')
    
    def test_book_has_tags_source(self):
        """Test Book model has tags_source field."""
        assert hasattr(Book, 'tags_source')
    
    def test_book_has_ai_analyzed_at(self):
        """Test Book model has ai_analyzed_at field."""
        assert hasattr(Book, 'ai_analyzed_at')
    
    def test_book_has_chapters_relationship(self):
        """Test Book model has chapters relationship."""
        assert hasattr(Book, 'chapters')


class TestChapterModel:
    """Test Chapter model fields."""
    
    def test_chapter_has_book_id(self):
        """Test Chapter model has book_id field."""
        assert hasattr(Chapter, 'book_id')
    
    def test_chapter_has_position_start(self):
        """Test Chapter model has position_start field."""
        assert hasattr(Chapter, 'position_start')


class TestReadingProgressModel:
    """Test ReadingProgress model fields."""
    
    def test_reading_progress_has_device_id(self):
        """Test ReadingProgress model has device_id field."""
        assert hasattr(ReadingProgress, 'device_id')
    
    def test_reading_progress_has_reading_settings(self):
        """Test ReadingProgress model has reading_settings field."""
        assert hasattr(ReadingProgress, 'reading_settings')


class TestAiCacheModel:
    """Test AiCache model fields."""
    
    def test_ai_cache_has_file_hash(self):
        """Test AiCache model has file_hash field."""
        assert hasattr(AiCache, 'file_hash')
    
    def test_ai_cache_has_confidence(self):
        """Test AiCache model has confidence field."""
        assert hasattr(AiCache, 'confidence')


class TestSettingsModel:
    """Test Settings model fields."""
    
    def test_settings_has_key(self):
        """Test Settings model has key field."""
        assert hasattr(Settings, 'key')
    
    def test_settings_has_value(self):
        """Test Settings model has value field."""
        assert hasattr(Settings, 'value')


class TestDatabaseIntegration:
    """Integration tests for database operations."""
    
    def test_database_initialization(self):
        """Test database can be initialized."""
        import asyncio
        asyncio.run(init_db())
        assert True  # If no exception, test passes
    
    def test_tables_created(self):
        """Test all required tables are created."""
        import asyncio
        from sqlalchemy import inspect
        
        async def check_tables():
            await init_db()
            
            async with engine.connect() as conn:
                def get_tables(sync_conn):
                    return inspect(sync_conn).get_table_names()
                
                tables = await conn.run_sync(get_tables)
            
            return tables
        
        tables = asyncio.run(check_tables())
        
        required_tables = ['books', 'chapters', 'reading_progress', 'ai_cache', 'settings']
        for table in required_tables:
            assert table in tables, f"Table '{table}' not found in database"
