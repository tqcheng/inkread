"""Llama.cpp client for local inference."""

import logging
from pathlib import Path
from typing import Optional, List
from functools import lru_cache

logger = logging.getLogger(__name__)


class LlamaCppClient:
    """Client for local llama.cpp inference using llama-cpp-python."""

    def __init__(
        self,
        model_path: str,
        context_size: int = 4096,
        n_threads: int = 4,
        verbose: bool = False,
    ):
        """Initialize the llama.cpp client."""
        self.model_path = Path(model_path)
        self.context_size = context_size
        self.n_threads = n_threads
        self.verbose = verbose
        self._llm = None  # Lazy loaded model
        self._lock = None  # Lazy loaded async lock

        logger.info(f"Initializing LlamaCppClient with model: {self.model_path}")

    def _get_lock(self):
        """Lazy get async lock to avoid event loop issues in non-async context."""
        if self._lock is None:
            import asyncio

            self._lock = asyncio.Lock()
        return self._lock

    async def _load_model(self):
        """Lazy load the llama.cpp model."""
        if self._llm is None:
            lock = self._get_lock()
            async with lock:
                if self._llm is None:  # Double check locking
                    try:
                        from llama_cpp import Llama
                        import asyncio

                        logger.info(f"Loading model from {self.model_path}...")

                        # Load model in thread pool to not block event loop
                        loop = asyncio.get_event_loop()
                        self._llm = await loop.run_in_executor(
                            None,
                            lambda: Llama(
                                model_path=str(self.model_path),
                                n_ctx=self.context_size,
                                n_threads=self.n_threads,
                                verbose=self.verbose,
                            ),
                        )

                        logger.info(f"Model loaded successfully!")
                    except ImportError:
                        logger.error(
                            "llama-cpp-python not installed! Please install it with: pip install llama-cpp-python"
                        )
                        raise
                    except Exception as e:
                        logger.error(f"Failed to load model: {e}")
                        raise
                    except Exception as e:
                        logger.error(f"Failed to load model: {e}")
                        raise

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.3,
        stop: Optional[List[str]] = None,
    ) -> str:
        """
        Generate text completion for prompt.

        Args:
            prompt: Input prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            stop: Stop sequences

        Returns:
            Generated text
        """
        await self._load_model()

        # Run inference in thread pool
        loop = asyncio.get_event_loop()

        try:
            result = await loop.run_in_executor(
                None,
                lambda: self._llm(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stop=stop or [],
                    echo=False,
                ),
            )

            return result["choices"][0]["text"].strip()

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise
