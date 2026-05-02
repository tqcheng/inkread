"""Scan router for library management."""

import asyncio
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, AsyncSessionLocal
from app.services.scanner import scan_library

logger = logging.getLogger(__name__)

router = APIRouter(tags=["scan"])


# In-memory storage for scan tasks (in production, use Redis or database)
# Structure: {task_id: ScanTask}
scan_tasks: Dict[str, "ScanTask"] = {}


class ScanTask:
    """Represents a scan task."""

    def __init__(self, task_id: str, library_path: Path):
        self.task_id = task_id
        self.library_path = library_path
        self.status = "pending"  # pending, running, completed, failed
        self.progress = {"current": 0, "total": 0}
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.created_at = datetime.utcnow()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert task to dictionary."""
        return {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat()
            if self.completed_at
            else None,
        }


# Pydantic models for API
class ScanRequest(BaseModel):
    """Request model for triggering a scan."""

    library_path: Optional[str] = Field(
        None,
        description="Path to library folder. If not provided, uses settings.LIBRARY_PATH",
    )


class ScanResponse(BaseModel):
    """Response model for scan trigger."""

    task_id: str
    status: str
    message: str


class ScanStatusResponse(BaseModel):
    """Response model for scan status."""

    task_id: str
    status: str
    progress: Dict[str, int]
    result: Optional[Dict[str, Any]]
    error: Optional[str]
    created_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]


class ScanResultSummary(BaseModel):
    """Summary of scan results."""

    total_tasks: int
    running: int
    completed: int
    failed: int


async def run_scan_task(task: ScanTask, db_session: AsyncSession) -> None:
    """
    Execute the scan task.

    This runs the actual scan operation and updates the task status.
    """
    try:
        task.status = "running"
        task.started_at = datetime.utcnow()

        logger.info(f"Starting scan task {task.task_id} for {task.library_path}")

        # Update progress before scan
        task.progress = {"current": 0, "total": 0}

        # Run the actual scan with session factory
        result = await scan_library(task.library_path, AsyncSessionLocal)

        # Update task with results
        task.result = result
        task.status = "completed"
        task.completed_at = datetime.utcnow()
        task.progress = {
            "current": result.get("scanned", 0),
            "total": result.get("total_files", 0),
        }

        logger.info(
            f"Scan task {task.task_id} completed: "
            f"{result.get('scanned', 0)} files, "
            f"{result.get('new_books', 0)} new, "
            f"{result.get('errors', 0)} errors"
        )

    except Exception as e:
        task.status = "failed"
        task.error = str(e)
        task.completed_at = datetime.utcnow()
        logger.exception(f"Scan task {task.task_id} failed: {e}")
        raise


@router.post(
    "/",
    response_model=ScanResponse,
    summary="Trigger library scan",
    description="Start a new scan task for the library folder. Returns immediately with task ID.",
)
async def trigger_scan(
    request: Optional[ScanRequest] = None,
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
) -> ScanResponse:
    """Trigger a library scan."""

    # Determine library path
    if request and request.library_path:
        library_path = Path(request.library_path)
    else:
        library_path = Path(settings.LIBRARY_PATH)

    # Validate path
    if not library_path.exists():
        raise HTTPException(
            status_code=400, detail=f"Library path does not exist: {library_path}"
        )

    if not library_path.is_dir():
        raise HTTPException(
            status_code=400, detail=f"Library path is not a directory: {library_path}"
        )

    # Check path safety (prevent directory traversal)
    try:
        resolved = library_path.resolve()
        if not resolved.is_absolute():
            raise HTTPException(status_code=400, detail="Library path must be absolute")

        # Security: restrict scan path to be within configured library path
        library_root = Path(settings.LIBRARY_PATH).resolve()
        if not str(resolved).startswith(str(library_root)):
            raise HTTPException(
                status_code=403,
                detail=f"Path must be within library path: {library_root}",
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid library path")

    # Create task
    task_id = str(uuid.uuid4())
    task = ScanTask(task_id=task_id, library_path=library_path)
    scan_tasks[task_id] = task

    # Start scan in background
    # Note: In production, use a proper task queue like Celery or RQ
    # For now, we create a background task
    asyncio.create_task(run_scan_task(task, db))

    logger.info(f"Created scan task {task_id} for {library_path}")

    return ScanResponse(
        task_id=task_id, status="queued", message="Scan task started successfully"
    )


@router.get(
    "/{task_id}",
    response_model=ScanStatusResponse,
    summary="Get scan task status",
    description="Get the current status and progress of a scan task.",
)
async def get_scan_status(task_id: str) -> ScanStatusResponse:
    """Get scan task status."""

    task = scan_tasks.get(task_id)

    if not task:
        raise HTTPException(status_code=404, detail=f"Scan task not found: {task_id}")

    return ScanStatusResponse(**task.to_dict())


@router.get(
    "/",
    response_model=ScanResultSummary,
    summary="Get scan task summary",
    description="Get a summary of all scan tasks.",
)
async def get_scan_summary() -> ScanResultSummary:
    """Get summary of all scan tasks."""

    total = len(scan_tasks)
    running = sum(1 for t in scan_tasks.values() if t.status == "running")
    completed = sum(1 for t in scan_tasks.values() if t.status == "completed")
    failed = sum(1 for t in scan_tasks.values() if t.status == "failed")

    return ScanResultSummary(
        total_tasks=total, running=running, completed=completed, failed=failed
    )
