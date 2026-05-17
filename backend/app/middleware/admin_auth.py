"""Admin authentication middleware."""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings


class AdminAuthMiddleware(BaseHTTPMiddleware):
    """Middleware to verify X-Admin-Key for admin endpoints."""

    EXEMPT_ADMIN_ROUTES = {
        ("POST", "/api/v1/admin/batch-delete"),
        ("POST", "/api/v1/admin/reset"),
    }

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/v1/admin"):
            # Allow CORS preflight requests
            if request.method == "OPTIONS":
                return await call_next(request)

            if (request.method, request.url.path) in self.EXEMPT_ADMIN_ROUTES:
                return await call_next(request)

            admin_key = request.headers.get("X-Admin-Key")
            if not admin_key or admin_key != settings.ADMIN_KEY:
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": "UNAUTHORIZED",
                        "message": "Invalid or missing admin key",
                        "details": None,
                    },
                )
        return await call_next(request)
