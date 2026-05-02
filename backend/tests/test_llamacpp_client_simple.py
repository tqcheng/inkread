"""Simple tests for llamacpp_client.py - focuses on non-integration parts."""

import pytest
from pathlib import Path


class TestLlamaCppClientInitialization:
    """Test basic initialization without requiring llama-cpp-python."""

    def test_init_with_default_params(self):
        """Test client initialization with default parameters."""
        from app.services.llamacpp_client import LlamaCppClient

        client = LlamaCppClient(model_path="/test/model.gguf")

        assert client.model_path == Path("/test/model.gguf")
        assert client.context_size == 4096
        assert client.n_threads == 4
        assert client.verbose is False
        assert client._llm is None

    def test_init_with_custom_params(self):
        """Test client initialization with custom parameters."""
        from app.services.llamacpp_client import LlamaCppClient

        client = LlamaCppClient(
            model_path="/custom/model.gguf",
            context_size=8192,
            n_threads=8,
            verbose=True,
        )

        assert client.model_path == Path("/custom/model.gguf")
        assert client.context_size == 8192
        assert client.n_threads == 8
        assert client.verbose is True


class TestLlamaCppClientHashAndPrompt:
    """Test helper methods that don't require model loading."""

    @pytest.mark.asyncio
    async def test_file_hash_calculation(self, tmp_path):
        """Test hash calculation from ai_classifier (for reference)."""
        from app.services.ai_classifier import AIClassifier

        classifier = AIClassifier()
        test_file = tmp_path / "test.txt"
        test_content = b"Test content for hashing"
        test_file.write_bytes(test_content)

        hash_value = await classifier._calculate_file_hash(test_file)

        assert isinstance(hash_value, str)
        assert len(hash_value) == 32  # MD5 hash length


class TestLlamaCppClientAsyncInterface:
    """Test async method signatures."""

    def test_generate_method_exists(self):
        """Test that generate method exists and has correct signature."""
        from app.services.llamacpp_client import LlamaCppClient
        import inspect

        client = LlamaCppClient(model_path="/test/model.gguf")

        # Check that method exists and is async
        assert hasattr(client, "generate")
        method = getattr(client, "generate")
        assert inspect.iscoroutinefunction(method)
