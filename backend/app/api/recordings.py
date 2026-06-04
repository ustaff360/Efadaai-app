"""
Recordings API - List and download call recordings
"""
from pathlib import Path
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.caller import CallLog
from app.models.agent import Agent
from app.models.category import Category

router = APIRouter()

# Recording storage path (Asterisk default)
RECORDING_BASE = Path("/var/spool/asterisk/monitor")


class RecordingResponse(BaseModel):
    id: int
    caller_number: str
    agent_name: str | None
    category_name: str | None
    call_start: str
    duration_sec: int
    recording_path: str | None


@router.get("/", response_model=list[RecordingResponse])
async def list_recordings(
    caller_number: str | None = None,
    agent_id: int | None = None,
    category_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List recordings with optional filters"""
    query = (
        select(CallLog, Agent.name, Category.name)
        .outerjoin(Agent, CallLog.agent_id == Agent.id)
        .outerjoin(Category, CallLog.category_id == Category.id)
        .where(CallLog.recording_path != None)
        .order_by(CallLog.call_start.desc())
    )

    if caller_number:
        query = query.where(CallLog.caller_number == caller_number)
    if agent_id:
        query = query.where(CallLog.agent_id == agent_id)
    if category_id:
        query = query.where(CallLog.category_id == category_id)
    if from_date:
        query = query.where(CallLog.call_start >= from_date)
    if to_date:
        query = query.where(CallLog.call_start <= to_date)

    query = query.offset((page - 1) * limit).limit(limit)

    result = await db.execute(query)
    recordings = []
    for cl, agent_name, cat_name in result.all():
        recordings.append(RecordingResponse(
            id=cl.id,
            caller_number=cl.caller_number,
            agent_name=agent_name,
            category_name=cat_name,
            call_start=str(cl.call_start),
            duration_sec=cl.duration_sec,
            recording_path=cl.recording_path,
        ))
    return recordings


@router.get("/{recording_id}/download/")
async def download_recording(
    recording_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Download a recording file"""
    result = await db.execute(select(CallLog).where(CallLog.id == recording_id))
    recording = result.scalar_one_or_none()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if not recording.recording_path:
        raise HTTPException(status_code=404, detail="No recording file for this call")

    # Try to find the file
    recording_file = Path(recording.recording_path)
    if not recording_file.exists():
        # Try alternate paths
        base = RECORDING_BASE / Path(recording.recording_path).parent.name
        for candidate in base.rglob(Path(recording.recording_path).name):
            recording_file = candidate
            break
        else:
            raise HTTPException(status_code=404, detail="Recording file not found on disk")

    # Stream the file
    def iterfile():
        with open(recording_file, "rb") as f:
            yield from f

    return StreamingResponse(
        iterfile(),
        media_type="audio/wav",
        headers={"Content-Disposition": f"attachment; filename=recording_{recording_id}.wav"},
    )
