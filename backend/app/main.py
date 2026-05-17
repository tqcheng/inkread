from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.database import init_db
from app.middleware.admin_auth import AdminAuthMiddleware
from app.routers import admin, ai, auth, books, chapters, scan, settings


class SPAStaticFiles(StaticFiles):
    """Serve SPA assets and fall back to index.html for client-side routes."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            # Preserve asset 404s; only fall back for extension-less SPA routes.
            if exc.status_code != 404 or "." in Path(path).name:
                raise

            return await super().get_response("index.html", scope)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


def resolve_frontend_dist() -> Path | None:
    backend_root = Path(__file__).resolve().parents[1]
    repo_root = backend_root.parent
    candidates = [
        backend_root / "frontend_dist",
        repo_root / "frontend" / "dist",
    ]

    for candidate in candidates:
        if (candidate / "index.html").exists():
            return candidate

    return None


def create_app(frontend_dist: Path | None = None) -> FastAPI:
    app = FastAPI(title="TXT Reader API", lifespan=lifespan)

    app.add_middleware(AdminAuthMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:31206",
            "http://localhost:32206",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:31206",
            "http://127.0.0.1:32206",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
    app.include_router(books.router, prefix="/api/v1/books", tags=["books"])
    app.include_router(chapters.router, prefix="/api/v1/chapters", tags=["chapters"])
    app.include_router(scan.router, prefix="/api/v1/scan", tags=["scan"])
    app.include_router(settings.router, prefix="/api/v1/settings", tags=["settings"])
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])

    frontend_dir = frontend_dist or resolve_frontend_dist()
    if frontend_dir is not None:
        app.mount("/", SPAStaticFiles(directory=frontend_dir, html=True), name="frontend")

    return app


app = create_app()
