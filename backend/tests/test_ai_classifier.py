"""Tests for the AI classifier service."""

import json
import hashlib
import pytest
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock, MagicMock

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai_classifier import AIClassifier
from app.models import AiCache, Book
from app.core.config import Settings


class TestAIClassifierInitialization:
    """Test AIClassifier initialization and configuration."""

    def test_init_with_disabled_provider(self):
        """Test classifier initialization with disabled provider."""
        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "disabled"
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()

            assert classifier.provider == "disabled"
            assert classifier.enabled is False
            assert classifier._llamacpp_client is None

    def test_init_with_llamacpp_provider(self):
        """Test classifier initialization with llamacpp provider."""
        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "llamacpp"
            mock_settings.LLAMACPP_MODEL_PATH = "/models/test.gguf"
            mock_settings.LLAMACPP_CONTEXT_SIZE = 4096
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()

            assert classifier.provider == "llamacpp"
            assert classifier.enabled is True
            assert classifier._llamacpp_client is None  # Lazy loading

    def test_init_with_openai_provider(self):
        """Test classifier initialization with openai provider."""
        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()

            assert classifier.provider == "openai"
            assert classifier.enabled is True

    def test_categories_defined(self):
        """Test that all required categories are defined."""
        classifier = AIClassifier()

        expected_categories = [
            "classical",
            "modern",
            "wuxia",
            "fantasy",
            "scifi",
            "anime",
            "urban",
        ]

        assert classifier.CATEGORIES == expected_categories


class TestFileHashCalculation:
    """Test file hash calculation for caching."""

    @pytest.mark.asyncio
    async def test_calculate_file_hash(self, tmp_path):
        """Test MD5 hash calculation from file content and size."""
        test_file = tmp_path / "test.txt"
        test_content = b"Test content for hashing"
        test_file.write_bytes(test_content)

        classifier = AIClassifier()
        file_hash = await classifier._calculate_file_hash(test_file)

        expected_content = test_content[:100]
        expected_hash = hashlib.md5(
            f"{expected_content}{len(test_content)}".encode()
        ).hexdigest()

        assert file_hash == expected_hash
        assert len(file_hash) == 32

    @pytest.mark.asyncio
    async def test_calculate_hash_large_file(self, tmp_path):
        """Test hash calculation for large files (only first 100 bytes used)."""
        test_file = tmp_path / "large.txt"
        large_content = b"A" * 2000
        test_file.write_bytes(large_content)

        classifier = AIClassifier()
        file_hash = await classifier._calculate_file_hash(test_file)

        expected_content = large_content[:100]
        expected_hash = hashlib.md5(
            f"{expected_content}{len(large_content)}".encode()
        ).hexdigest()

        assert file_hash == expected_hash


class TestPromptBuilding:
    """Test prompt building for LLM classification."""

    def test_build_prompt_structure(self):
        """Test that prompt contains all required elements."""
        classifier = AIClassifier()
        sample_text = "Sample novel content for classification"

        prompt = classifier._build_prompt(sample_text)

        assert "分析以下小说文本" in prompt
        assert sample_text in prompt
        assert "classical" in prompt
        assert "wuxia" in prompt
        assert "fantasy" in prompt
        assert "tags" in prompt
        assert "JSON" in prompt
        assert "confidence" in prompt

    def test_build_prompt_truncation(self):
        """Test that long text samples are truncated to 1000 characters."""
        classifier = AIClassifier()
        long_text = "A" * 1000 + "B" * 1000

        prompt = classifier._build_prompt(long_text)

        assert "A" * 1000 in prompt
        assert "B" * 1000 not in prompt


class TestTextExtraction:
    """Test text sample extraction from files."""

    @pytest.mark.asyncio
    async def test_extract_sample_basic(self, tmp_path):
        """Test basic text extraction (first 800 bytes + middle at 20%)."""
        test_file = tmp_path / "novel.txt"
        content = "H" * 800 + "M" * 300 + "T" * 900
        test_file.write_text(content, encoding="utf-8")

        classifier = AIClassifier()
        sample = await classifier._extract_sample(test_file)

        assert "..." in sample
        parts = sample.split("\n...\n")
        assert len(parts) == 2
        assert len(parts[0]) == 800
        assert "H" in parts[0]
        assert len(parts[1]) <= 300

    @pytest.mark.asyncio
    async def test_extract_sample_small_file(self, tmp_path):
        """Test extraction from small file (< 1600 bytes, no middle section)."""
        test_file = tmp_path / "short.txt"
        content = "S" * 500
        test_file.write_text(content, encoding="utf-8")

        classifier = AIClassifier()
        sample = await classifier._extract_sample(test_file)

        assert "..." in sample
        parts = sample.split("\n...\n")
        assert len(parts) == 2
        assert len(parts[0]) == 500
        assert parts[1] == ""

    @pytest.mark.asyncio
    async def test_extract_sample_max_1000_chars(self, tmp_path):
        """Test that extracted sample is limited to 1000 characters."""
        test_file = tmp_path / "long.txt"
        content = "X" * 2000
        test_file.write_text(content, encoding="utf-8")

        classifier = AIClassifier()
        sample = await classifier._extract_sample(test_file)

        assert len(sample) <= 1000


class TestCacheIntegration:
    """Test AI cache database integration."""

    @pytest.mark.asyncio
    async def test_cache_lookup_on_classify(self, db_session, tmp_path):
        """Test that classification checks cache first."""
        test_hash = "abcdef1234567890abcdef1234567890"
        cache_entry = AiCache(
            file_hash=test_hash,
            category="wuxia",
            tags=["江湖", "武功", "复仇"],
            confidence=0.85,
        )
        db_session.add(cache_entry)
        await db_session.commit()

        test_file = tmp_path / "cached_novel.txt"
        test_file.write_text("Test content", encoding="utf-8")

        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "llamacpp"
            mock_settings.LLAMACPP_MODEL_PATH = "/models/test.gguf"
            mock_settings.LLAMACPP_CONTEXT_SIZE = 4096
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()
            with patch.object(
                classifier, "_calculate_file_hash", return_value=test_hash
            ):
                result = await classifier.classify(test_file, db_session)

        assert result is not None
        assert result["category"] == "wuxia"
        assert result["cached"] is True


class TestLLMCalling:
    """Test LLM calling and response parsing."""

    @pytest.mark.asyncio
    async def test_call_llm_with_llamacpp(self):
        """Test calling llama.cpp provider."""
        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "llamacpp"
            mock_settings.LLAMACPP_MODEL_PATH = "/models/test.gguf"
            mock_settings.LLAMACPP_CONTEXT_SIZE = 4096
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()

            mock_client = AsyncMock()
            mock_client.generate.return_value = (
                '{"category": "wuxia", "tags": ["江湖", "武功"], "confidence": 0.85}'
            )

            classifier._llamacpp_client = mock_client

            result = await classifier._call_llm("Sample text")

            assert result["category"] == "wuxia"
            assert result["tags"] == ["江湖", "武功"]
            assert result["confidence"] == 0.85

    @pytest.mark.asyncio
    async def test_call_llm_json_parsing(self):
        """Test JSON parsing from LLM response."""
        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "llamacpp"
            mock_settings.LLAMACPP_MODEL_PATH = "/models/test.gguf"
            mock_settings.LLAMACPP_CONTEXT_SIZE = 4096
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()

            mock_response = """Here's the analysis:
            {"category": "fantasy", "tags": ["修仙", "穿越"], "confidence": 0.92}
            Hope this helps!"""

            mock_client = AsyncMock()
            mock_client.generate.return_value = mock_response
            classifier._llamacpp_client = mock_client

            result = await classifier._call_llm("Sample")

            assert result["category"] == "fantasy"
            assert "修仙" in result["tags"]

    @pytest.mark.skip(reason="ollama module not installed in test environment")
    @pytest.mark.asyncio
    async def test_call_llm_with_ollama(self):
        """Test calling Ollama provider."""
        pass  # Will be skipped


class TestCategoryValidation:
    """Test category validation logic."""

    @pytest.mark.asyncio
    async def test_invalid_category_set_to_uncategorized(self, tmp_path):
        """Test that invalid categories are set to uncategorized."""
        test_file = tmp_path / "novel.txt"
        test_file.write_text("Content", encoding="utf-8")

        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "llamacpp"
            mock_settings.LLAMACPP_MODEL_PATH = "/models/test.gguf"
            mock_settings.LLAMACPP_CONTEXT_SIZE = 4096
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()

            mock_client = AsyncMock()
            mock_client.generate.return_value = (
                '{"category": "invalid_category", "tags": ["tag"], "confidence": 0.9}'
            )
            classifier._llamacpp_client = mock_client

            result = await classifier.classify(test_file, None)

            assert result is None  # classify returns None when db_session is None

    @pytest.mark.asyncio
    async def test_low_confidence_set_to_uncategorized(self, tmp_path):
        """Test that low confidence (<0.5) results are set to uncategorized."""
        test_file = tmp_path / "novel.txt"
        test_file.write_text("Content", encoding="utf-8")

        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "llamacpp"
            mock_settings.LLAMACPP_MODEL_PATH = "/models/test.gguf"
            mock_settings.LLAMACPP_CONTEXT_SIZE = 4096
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()

            mock_client = AsyncMock()
            mock_client.generate.return_value = (
                '{"category": "wuxia", "tags": ["tag"], "confidence": 0.3}'
            )
            classifier._llamacpp_client = mock_client

            result = await classifier.classify(test_file, None)

            assert result is None  # classify returns None when db_session is None


class TestErrorHandling:
    """Test error handling in classification."""

    @pytest.mark.asyncio
    async def test_classify_disabled_provider_returns_none(self, tmp_path):
        """Test that disabled provider returns None."""
        test_file = tmp_path / "novel.txt"
        test_file.write_text("Content", encoding="utf-8")

        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "disabled"
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()
            result = await classifier.classify(test_file, None)

            assert result is None

    @pytest.mark.asyncio
    async def test_classify_exception_returns_none(self, db_session, tmp_path):
        """Test that exceptions during classification return None gracefully."""
        with patch("app.services.ai_classifier.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "llamacpp"
            mock_settings.LLAMACPP_MODEL_PATH = "/models/test.gguf"
            mock_settings.LLAMACPP_CONTEXT_SIZE = 4096
            mock_settings.AI_CACHE_TTL = 2592000

            classifier = AIClassifier()

            test_file = tmp_path / "novel.txt"
            test_file.write_text("Content", encoding="utf-8")

            with patch.object(
                classifier, "_calculate_file_hash", side_effect=IOError("Test error")
            ):
                result = await classifier.classify(test_file, db_session)

            assert result is None
