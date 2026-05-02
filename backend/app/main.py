from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.middleware.admin_auth import AdminAuthMiddleware
from app.routers import admin, books, chapters, scan, settings, ai

app = FastAPI(title="TXT Reader API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:31206",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:31206",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin auth middleware
app.add_middleware(AdminAuthMiddleware)

# Register routers
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(books.router, prefix="/api/v1/books", tags=["books"])
app.include_router(chapters.router, prefix="/api/v1/chapters", tags=["chapters"])
app.include_router(scan.router, prefix="/api/v1/scan", tags=["scan"])
app.include_router(settings.router, prefix="/api/v1/settings", tags=["settings"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
