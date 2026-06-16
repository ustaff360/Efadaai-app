"""
Callers API — Caller Management, History, Blocklist
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import JSONResponse
from app.core.database import get_db
from app.models.caller import Caller, CallLog, BlockList
from app.models.agent import Agent
from app.models.category import Category, DID

router = APIRouter()


# ---- SCHEMAS ----

class CallerResponse(BaseModel):
    id: int
    caller_number: str
    caller_name: str | None
    total_calls: int
    is_blocked: bool
    block_reason: str | None
    last_call_at: str | None
    last_category: str | None = None
    last_agent_name: str | None = None
    last_agent_extension: str | None = None
    last_did: str | None = None

    class Config:
        from_attributes = True


class CallLogResponse(BaseModel):
    id: int
    caller_number: str
    agent_name: str | None
    agent_extension: str | None
    category_name: str | None
    did_number: str | None
    call_start: str
    call_end: str | None
    duration_sec: int
    is_repeat: bool
    is_blocked: bool
    recording_path: str | None

    class Config:
        from_attributes = True


class BlockListCreate(BaseModel):
    phone_number: str
    reason: str | None = None
    destination: str = "voicemail"  # voicemail, announcement, extension
    destination_value: str | None = None


class BlockListUpdate(BaseModel):
    reason: str | None = None
    destination: str | None = None
    destination_value: str | None = None
    active: bool | None = None


class BlockListResponse(BaseModel):
    id: int
    phone_number: str
    reason: str | None
    destination: str
    destination_value: str | None
    active: bool
    created_at: str | None = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_str(cls, obj):
        data = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
        if data.get("created_at"):
            data["created_at"] = str(data["created_at"])
        return cls(**data)


# ---- CALLER ENDPOINTS ----

@router.get("/", response_model=list[CallerResponse])
async def list_callers(
    search: str | None = None,
    blocked: bool | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List all tracked callers with optional search and block filter"""
    base_query = select(Caller)
    if search:
        base_query = base_query.where(
            or_(
                Caller.caller_number.ilike(f"%{search}%"),
                Caller.caller_name.ilike(f"%{search}%"),
            )
        )
    if blocked is not None:
        base_query = base_query.where(Caller.is_blocked == blocked)

    total_count_query = base_query.with_only_columns(func.count(Caller.id))
    total_count_result = await db.execute(total_count_query)
    total_count = total_count_result.scalar_one() or 0

    query = base_query.order_by(Caller.last_call_at.desc().nullslast()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    callers = result.scalars().all()

    # Enrich with last call details (agent, category, DID)
    enriched = []
    for caller in callers:
        last_call_result = await db.execute(
            select(CallLog, Agent, Category, DID)
            .outerjoin(Agent, CallLog.agent_id == Agent.id)
            .outerjoin(Category, CallLog.category_id == Category.id)
            .outerjoin(DID, CallLog.did_id == DID.id)
            .where(CallLog.caller_number == caller.caller_number)
            .order_by(CallLog.call_start.desc())
            .limit(1)
        )
        last_row = last_call_result.first()
        last_log, last_agent, last_cat, last_did = last_row if last_row else (None, None, None, None)

        enriched.append(CallerResponse(
            id=caller.id,
            caller_number=caller.caller_number,
            caller_name=caller.caller_name,
            total_calls=caller.total_calls,
            is_blocked=caller.is_blocked,
            block_reason=caller.block_reason,
            last_call_at=str(caller.last_call_at) if caller.last_call_at else None,
            last_category=last_cat.name if last_cat else None,
            last_agent_name=last_agent.name if last_agent else None,
            last_agent_extension=last_agent.extension if last_agent else None,
            last_did=last_did.did_number if last_did else None,
        ))

    return JSONResponse(content=[item.model_dump() for item in enriched], headers={"X-Total-Count": str(total_count)})


@router.get("/{caller_number}/history/", response_model=list[CallLogResponse])
async def get_caller_history(
    caller_number: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Get call history for a specific caller"""
    query = (
        select(CallLog, Agent, Category, DID)
        .outerjoin(Agent, CallLog.agent_id == Agent.id)
        .outerjoin(Category, CallLog.category_id == Category.id)
        .outerjoin(DID, CallLog.did_id == DID.id)
        .where(CallLog.caller_number == caller_number)
        .order_by(CallLog.call_start.desc())
    )
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)

    history = []
    for log, agent, category, did in result.all():
        history.append(CallLogResponse(
            id=log.id,
            caller_number=log.caller_number,
            agent_name=agent.name if agent else None,
            agent_extension=agent.extension if agent else None,
            category_name=category.name if category else None,
            did_number=did.did_number if did else None,
            call_start=str(log.call_start),
            call_end=str(log.call_end) if log.call_end else None,
            duration_sec=log.duration_sec,
            is_repeat=log.is_repeat,
            is_blocked=log.is_blocked,
            recording_path=log.recording_path,
        ))
    return history


@router.delete("/{caller_id}/")
async def delete_caller(caller_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a caller record and their call logs"""
    caller = await db.get(Caller, caller_id)
    if not caller:
        raise HTTPException(status_code=404, detail="Caller not found")
    # Delete call logs for this caller
    logs = await db.execute(select(CallLog).where(CallLog.caller_number == caller.caller_number))
    for log in logs.scalars().all():
        await db.delete(log)
    await db.delete(caller)
    await db.flush()
    return {"message": "Caller and history deleted"}


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.post("/bulk-delete/")
async def bulk_delete_callers(data: BulkDeleteRequest, db: AsyncSession = Depends(get_db)):
    """Bulk delete caller records"""
    deleted = 0
    for caller_id in data.ids:
        caller = await db.get(Caller, caller_id)
        if caller:
            logs = await db.execute(select(CallLog).where(CallLog.caller_number == caller.caller_number))
            for log in logs.scalars().all():
                await db.delete(log)
            await db.delete(caller)
            deleted += 1
    await db.flush()
    return {"message": f"Deleted {deleted} callers", "deleted": deleted}


@router.post("/{caller_number}/block/")
async def block_caller(caller_number: str, data: BlockListCreate, db: AsyncSession = Depends(get_db)):
    """Block a caller number"""
    # Check if already blocked
    existing = await db.execute(select(BlockList).where(BlockList.phone_number == caller_number))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Number already in blocklist")

    entry = BlockList(
        phone_number=caller_number,
        reason=data.reason,
        destination=data.destination,
        destination_value=data.destination_value,
    )
    db.add(entry)

    # Update caller record
    caller_result = await db.execute(select(Caller).where(Caller.caller_number == caller_number))
    caller = caller_result.scalar_one_or_none()
    if caller:
        caller.is_blocked = True
        caller.block_reason = data.reason

    await db.flush()
    return {"message": "Caller blocked", "block_id": entry.id}


@router.post("/{caller_number}/unblock/")
async def unblock_caller(caller_number: str, db: AsyncSession = Depends(get_db)):
    """Unblock a caller number"""
    result = await db.execute(select(BlockList).where(BlockList.phone_number == caller_number))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Number not in blocklist")

    entry.active = False

    # Update caller record
    caller_result = await db.execute(select(Caller).where(Caller.caller_number == caller_number))
    caller = caller_result.scalar_one_or_none()
    if caller:
        caller.is_blocked = False
        caller.block_reason = None

    await db.flush()
    return {"message": "Caller unblocked"}


# ---- BLOCKLIST ENDPOINTS ----

@router.get("/blocklist/all/")
async def list_blocklist(
    search: str | None = None,
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    """List all blocked numbers"""
    query = select(BlockList)
    if active_only:
        query = query.where(BlockList.active == True)
    if search:
        query = query.where(
            or_(
                BlockList.phone_number.ilike(f"%{search}%"),
                BlockList.reason.ilike(f"%{search}%"),
            )
        )
    query = query.order_by(BlockList.created_at.desc())
    result = await db.execute(query)
    entries = result.scalars().all()

    return [
        {
            "id": e.id,
            "phone_number": e.phone_number,
            "reason": e.reason,
            "destination": e.destination,
            "destination_value": e.destination_value,
            "active": e.active,
            "created_at": str(e.created_at) if e.created_at else None,
        }
        for e in entries
    ]


@router.post("/blocklist/", status_code=201)
async def add_to_blocklist(data: BlockListCreate, db: AsyncSession = Depends(get_db)):
    """Add a number to blocklist"""
    existing = await db.execute(select(BlockList).where(BlockList.phone_number == data.phone_number))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Number already in blocklist")

    entry = BlockList(**data.model_dump())
    db.add(entry)
    await db.flush()
    return {"message": "Number added to blocklist", "block_id": entry.id}


@router.put("/blocklist/{block_id}/")
async def update_blocklist_entry(block_id: int, data: BlockListUpdate, db: AsyncSession = Depends(get_db)):
    """Update a blocklist entry"""
    entry = await db.get(BlockList, block_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Blocklist entry not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(entry, key, value)

    await db.flush()
    return {"message": "Blocklist entry updated"}


@router.delete("/blocklist/{block_id}/", status_code=204)
async def remove_from_blocklist(block_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a number from blocklist"""
    entry = await db.get(BlockList, block_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Blocklist entry not found")
    await db.delete(entry)
    await db.flush()
