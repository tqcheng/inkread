from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_settings():
    """Get system settings."""
    return {
        "library_path": "/books",
        "ai_provider": "disabled",
        "theme": "light"
    }


@router.put("/")
async def update_settings(settings: dict):
    """Update system settings."""
    return {"updated": True}