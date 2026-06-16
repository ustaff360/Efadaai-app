"""
Call Lifecycle API — Start, terminate, and track active calls
"""
from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.caller import CallLog, Caller, BlockList
from app.models.category import DID, Category, CategoryAgent
from app.models.agent import Agent
from app.core.redis import get_redis, get_agent_status, get_sticky_agent, set_sticky_agent
from app.core.config import settings

router = APIRouter()


class CallStartRequest(BaseModel):
    caller_number: str
    caller_name: str | None = None
    dialed_number: str  # DID
    channel_id: str | None = None


class CallTerminateRequest(BaseModel):
    call_id: int
    caller_number: str
    channel_id: str | None = None


class ActiveCallResponse(BaseModel):
    id: int
    caller_number: str
    caller_name: str | None
    agent_name: str | None
    agent_extension: str | None
    category_name: str | None
    did_number: str | None
    call_start: str
    duration_sec: int


@router.post("/start/", response_model=ActiveCallResponse, status_code=201)
async def start_call(request: CallStartRequest, db: AsyncSession = Depends(get_db)):
    """
    Start tracking a new call. Looks up the routing for this call
    and assigns an agent based on the routing strategy.
    """
    # Check blocklist
    blocked_result = await db.execute(
        select(BlockList).where(
            and_(BlockList.phone_number == request.caller_number, BlockList.active == True)
        )
    )
    blocked = blocked_result.scalar_one_or_none()
    if blocked:
        return ActiveCallResponse(
            id=0,
            caller_number=request.caller_number,
            caller_name=request.caller_name,
            agent_name=None,
            agent_extension=None,
            category_name=None,
            did_number=request.dialed_number,
            call_start=datetime.now(timezone.utc).isoformat(),
            duration_sec=0,
        )

    # Lookup DID -> Category
    did_result = await db.execute(
        select(DID).where(DID.did_number == request.dialed_number)
    )
    did = did_result.scalar_one_or_none()
    if not did:
        raise HTTPException(status_code=404, detail=f"No category found for DID: {request.dialed_number}")

    category_result = await db.execute(
        select(Category).where(Category.id == did.category_id)
    )
    category = category_result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail=f"Category not found for DID: {request.dialed_number}")

    # Get routing strategy
    strategy_result = await db.execute(
        select(CategoryAgent.routing_strategy).where(
            and_(CategoryAgent.category_id == did.category_id, CategoryAgent.active == True)
        ).limit(1)
    )
    strategy_row = strategy_result.scalar_one_or_none()
    strategy = strategy_row or "weighted"

    # Get agents for this category
    agents_result = await db.execute(
        select(CategoryAgent, Agent)
        .join(Agent, CategoryAgent.agent_id == Agent.id)
        .where(and_(
            CategoryAgent.category_id == did.category_id,
            CategoryAgent.active == True,
            Agent.status == "active",
        ))
    )
    agent_list = []
    for ca, agent in agents_result.all():
        if not ca.override_weight:
            continue
        agent_list.append({"agent": agent, "weight": ca.override_weight})
    if not agent_list:
        raise HTTPException(status_code=503, detail="No agents available for this category")

    # Get idle agents
    r = await get_redis()
    idle_agents = []
    for info in agent_list:
        status = await r.get(f"agent_status:{info['agent'].extension}")
        if status == "idle":
            idle_agents.append(info)

    if not idle_agents:
        # All busy — select first agent as fallback
        selected_agent = agent_list[0]["agent"]
    else:
        # Check sticky agent (repeat caller)
        sticky_agent_id = await get_sticky_agent(request.caller_number, category.id)
        selected_agent = None

        if sticky_agent_id:
            for ai in idle_agents:
                if ai["agent"].id == sticky_agent_id:
                    selected_agent = ai["agent"]
                    break

        if not selected_agent:
            if strategy == "round_robin":
                key = f"round_robin:{did.category_id}"
                index = await r.incr(key)
                sorted_agents = sorted(idle_agents, key=lambda a: a["agent"].id)
                idx = (index - 1) % len(sorted_agents)
                selected_agent = sorted_agents[idx]["agent"]
            elif strategy == "sequential":
                sorted_agents = sorted(idle_agents, key=lambda a: a["agent"].id)
                selected_agent = sorted_agents[0]["agent"]
            else:
                # weighted random
                total_w = sum(a["weight"] for a in idle_agents)
                if total_w > 0:
                    import random
                    rand_val = random.uniform(0, total_w)
                    cumulative = 0
                    for ai in idle_agents:
                        cumulative += ai["weight"]
                        if rand_val <= cumulative:
                            selected_agent = ai["agent"]
                            break
                    else:
                        selected_agent = idle_agents[-1]["agent"]
                else:
                    import random
                    selected_agent = random.choice(idle_agents)["agent"]

    # Create call log
    now = datetime.now(timezone.utc)
    call_log = CallLog(
        caller_number=request.caller_number,
        call_uuid=str(uuid.uuid4()),
        agent_id=selected_agent.id,
        category_id=category.id,
        did_id=did.id,
        call_start=now,
        duration_sec=0,
        is_blocked=False,
    )
    db.add(call_log)

    # Update caller tracking
    caller_result = await db.execute(
        select(Caller).where(Caller.caller_number == request.caller_number)
    )
    caller = caller_result.scalar_one_or_none()
    if caller:
        caller.total_calls += 1
        caller.last_call_at = now
        if request.caller_name and not caller.caller_name:
            caller.caller_name = request.caller_name
    else:
        caller = Caller(
            caller_number=request.caller_number,
            caller_name=request.caller_name,
            total_calls=1,
            last_call_at=now,
        )
        db.add(caller)

    # Set sticky agent
    await set_sticky_agent(
        request.caller_number, category.id, selected_agent.id,
        settings.STICKY_WINDOW_DAYS if hasattr(settings, 'STICKY_WINDOW_DAYS') else 30
    )

    await db.flush()
    await db.refresh(call_log)

    return ActiveCallResponse(
        id=call_log.id,
        caller_number=request.caller_number,
        caller_name=request.caller_name,
        agent_name=selected_agent.name,
        agent_extension=selected_agent.extension,
        category_name=category.name,
        did_number=request.dialed_number,
        call_start=call_log.call_start.isoformat(),
        duration_sec=0,
    )


@router.post("/terminate/")
async def terminate_call(request: CallTerminateRequest, db: AsyncSession = Depends(get_db)):
    """
    Terminate a tracked call and record its duration.
    """
    # Find the active call log
    result = await db.execute(
        select(CallLog).where(
            and_(
                CallLog.caller_number == request.caller_number,
                CallLog.call_end == None,
                CallLog.is_blocked == False,
            )
        ).order_by(CallLog.call_start.desc()).limit(1)
    )
    call_log = result.scalar_one_or_none()

    if not call_log:
        # Create a new log with short duration (call may have been lost)
        call_log = CallLog(
            caller_number=request.caller_number,
            call_start=datetime.now(timezone.utc),
            call_end=datetime.now(timezone.utc),
            duration_sec=0,
            is_blocked=False,
        )
        db.add(call_log)
        await db.flush()
        return {"status": "terminated", "call_id": call_log.id, "duration_sec": 0}

    now = datetime.now(timezone.utc)
    call_log.call_end = now
    call_log.duration_sec = int((now - call_log.call_start).total_seconds())

    await db.flush()
    await db.refresh(call_log)

    return {
        "status": "terminated",
        "call_id": call_log.id,
        "caller_number": request.caller_number,
        "agent_name": call_log.agent.name if call_log.agent else None,
        "agent_extension": call_log.agent.extension if call_log.agent else None,
        "category_name": call_log.category.name if call_log.category else None,
        "call_start": call_log.call_start.isoformat(),
        "call_end": call_log.call_end.isoformat(),
        "duration_sec": call_log.duration_sec,
    }


@router.get("/active/", response_model=list[ActiveCallResponse])
async def list_active_calls(db: AsyncSession = Depends(get_db)):
    """Get all currently active (in-progress) calls."""
    result = await db.execute(
        select(CallLog, Agent.name, Agent.extension, Category.name, DID.did_number)
        .outerjoin(Agent, CallLog.agent_id == Agent.id)
        .outerjoin(Category, CallLog.category_id == Category.id)
        .outerjoin(DID, CallLog.did_id == DID.id)
        .where(and_(
            CallLog.call_end == None,
            CallLog.is_blocked == False,
        ))
        .order_by(CallLog.call_start.desc())
    )
    rows = result.all()

    calls = []
    now = datetime.now(timezone.utc)
    for cl, agent_name, agent_ext, cat_name, did_num in rows:
        duration = int((now - cl.call_start).total_seconds())
        calls.append(ActiveCallResponse(
            id=cl.id,
            caller_number=cl.caller_number,
            caller_name=None,
            agent_name=agent_name,
            agent_extension=agent_ext,
            category_name=cat_name,
            did_number=did_num,
            call_start=cl.call_start.isoformat(),
            duration_sec=duration,
        ))
    return calls
