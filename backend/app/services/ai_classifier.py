"""AI classification service for novel categorization and tagging."""

import asyncio
import aiofiles
import json
import logging
import hashlib
from pathlib import Path
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from tenacity import retry, stop_after_attempt, wait_exponential

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiCache, Book
from app.core.config import settings

logger = logging.getLogger(__name__)


class AIClassifier:
    """AI classifier for novel categorization and tagging."""

    # Classification categories
    CATEGORIES = [
        "classical",  # 古典
        "modern",  # 现代
        "wuxia",  # 武侠
        "fantasy",  # 玄幻
        "scifi",  # 科幻
        "anime",  # 动漫
        "urban",  # 都市
    ]

    def __init__(self):
        self.provider = settings.AI_PROVIDER
        self.enabled = self.provider != "disabled"
        self._llamacpp_client = None
        self.ollama_timeout = 10.0
        self.openai_timeout = 30.0
        self.llamacpp_timeout = 10.0
        self.cache_ttl = timedelta(seconds=settings.AI_CACHE_TTL)

    def _get_llamacpp_client(self):
        """Lazy load llama.cpp client."""
        if self._llamacpp_client is None:
            from app.services.llamacpp_client import LlamaCppClient

            self._llamacpp_client = LlamaCppClient(
                model_path=settings.LLAMACPP_MODEL_PATH,
                context_size=settings.LLAMACPP_CONTEXT_SIZE,
            )
        return self._llamacpp_client

    async def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate MD5 hash of first 100 bytes + file size."""
        async with aiofiles.open(file_path, "rb") as f:
            content = await f.read(1024)
        file_size = file_path.stat().st_size
        sample = content[:100]
        return hashlib.md5(f"{sample}{file_size}".encode()).hexdigest()

    async def _get_cache(
        self, db_session: AsyncSession, file_hash: str
    ) -> Optional[Dict[str, Any]]:
        """Get cached AI classification result if not expired."""
        from sqlalchemy import select

        result = await db_session.execute(
            select(AiCache).where(AiCache.file_hash == file_hash)
        )
        cached = result.scalar_one_or_none()

        if not cached:
            return None

        # Check TTL
        if datetime.utcnow() - cached.created_at > self.cache_ttl:
            return None

        return {
            "category": cached.category,
            "tags": cached.tags,
            "confidence": cached.confidence,
            "cached": True,
        }

    async def _set_cache(
        self, db_session: AsyncSession, file_hash: str, result: Dict[str, Any]
    ):
        """Cache AI classification result."""
        # Check if cache entry already exists
        from sqlalchemy import select

        existing = await db_session.execute(
            select(AiCache).where(AiCache.file_hash == file_hash)
        )
        cache_entry = existing.scalar_one_or_none()

        if cache_entry:
            # Update existing
            cache_entry.category = result.get("category")
            cache_entry.tags = result.get("tags", [])
            cache_entry.confidence = result.get("confidence", 0.0)
            cache_entry.created_at = datetime.utcnow()
        else:
            # Create new
            cache_entry = AiCache(
                file_hash=file_hash,
                category=result.get("category"),
                tags=result.get("tags", []),
                confidence=result.get("confidence", 0.0),
            )
            db_session.add(cache_entry)

        await db_session.commit()

    def _build_prompt(self, text_sample: str) -> str:
        """Build classification prompt."""
        return f"""分析以下小说文本，判断分类和标签。
文本内容：
{text_sample[:1000]}

要求：
1. 从以下分类中选择最匹配的一个（仅返回分类名）：
   classical(古典/历史/名著)
   modern(现代文学/当代小说)
   wuxia(武侠/江湖/武功)
   fantasy(玄幻/修仙/奇幻/魔法)
   scifi(科幻/未来/太空/科技)
   anime(动漫/轻小说/二次元)
   urban(都市/职场/言情/现实)
2. 提取3-5个关键词标签（如"穿越","系统","修仙"等），用逗号分隔
3. 返回JSON格式：{{"category": "...", "tags": [...], "confidence": 0.85}}
"""

    @retry(
        stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    async def _call_llm(self, text: str) -> Dict[str, Any]:
        """Call LLM for classification with retry."""
        prompt = self._build_prompt(text)

        if self.provider == "llamacpp":
            client = self._get_llamacpp_client()
            response = await client.generate(
                prompt, max_tokens=256, temperature=0.3, stop=["}"]
            )
            # Parse JSON response
            try:
                start = response.find("{")
                end = response.rfind("}") + 1
                if start >= 0 and end > start:
                    return json.loads(response[start:end])
                else:
                    raise ValueError("No JSON found in response")
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM response: {e}, response: {response}")
                return {"category": "uncategorized", "tags": [], "confidence": 0.0}

        elif self.provider == "ollama":
            import ollama

            client = ollama.AsyncClient(host=settings.OLLAMA_HOST)
            response = await client.chat(
                model=settings.OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                format="json",
                options={"temperature": 0.3, "num_ctx": 4096},
            )
            return json.loads(response.message.content)

        elif self.provider == "openai":
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.3,
                timeout=self.openai_timeout,
            )
            return json.loads(response.choices[0].message.content)

        else:
            raise ValueError(f"Unknown AI provider: {self.provider}")

    async def classify(
        self, file_path: Path, db_session: AsyncSession
    ) -> Optional[Dict[str, Any]]:
        """
        Classify a novel file.

        Args:
            file_path: Path to the novel file
            db_session: Database session

        Returns:
            Dict with category, tags, confidence or None if disabled
        """
        if not self.enabled:
            return None

        try:
            # Calculate file hash for cache
            file_hash = await self._calculate_file_hash(file_path)

            # Check cache
            cached = await self._get_cache(db_session, file_hash)
            if cached:
                logger.debug(f"AI classification cache hit for {file_path.name}")
                return cached

            # Extract sample text
            sample = await self._extract_sample(file_path)

            # Call LLM with timeout
            try:
                result = await asyncio.wait_for(
                    self._call_llm(sample),
                    timeout=self.ollama_timeout
                    if self.provider in ["ollama", "llamacpp"]
                    else self.openai_timeout,
                )
            except asyncio.TimeoutError:
                logger.error(f"AI classification timed out for {file_path}")
                return None

            # Validate category
            category = result.get("category", "uncategorized")
            if category not in self.CATEGORIES:
                category = "uncategorized"

            # Filter low confidence
            confidence = result.get("confidence", 0.0)
            if confidence < 0.5:
                category = "uncategorized"

            result["category"] = category
            result["confidence"] = confidence

            # Cache result
            await self._set_cache(db_session, file_hash, result)

            return {**result, "cached": False}

        except Exception as e:
            logger.exception(f"AI classification failed for {file_path}: {e}")
            return None

    async def _extract_sample(self, file_path: Path) -> str:
        """Extract sample text from file for classification (max 1000 chars)."""
        file_size = file_path.stat().st_size

        async with aiofiles.open(
            file_path, "r", encoding="utf-8", errors="ignore"
        ) as f:
            # Read first 800 bytes
            head = await f.read(800)

            # Read middle 300 bytes at 20% position
            if file_size > 1600:
                await f.seek(int(file_size * 0.2))
                middle = await f.read(300)
            else:
                middle = ""

        sample = f"{head}\n...\n{middle}"
        return sample[:1000]
