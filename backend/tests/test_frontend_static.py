"""Tests for serving built frontend assets from FastAPI."""

from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

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
