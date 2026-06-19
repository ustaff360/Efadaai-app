"""
Agents CRUD API — category weights live on CategoryAgent only.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.agent import Agent
from app.models.caller import CallLog
from app.models.category import CategoryAgent, Category
from app.core.audit import log_audit

router = APIRouter()


class AgentCreate(BaseModel):
    name: str
    extension: str
    email: str | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    status: str | None = None


class AgentResponse(BaseModel):
    id: int
    name: str
    extension: str
    email: str | None
    status: str
    total_calls: int = 0
    categories: list[dict] = []
    category_assignments: list[dict] = []

    class Config:
        from_attributes = True


class AgentStatsResponse(BaseModel):
    agent_id: int
    agent_name: str
    total_calls: int
    answered_calls: int
    missed_calls: int
    avg_duration: float
    categories: list[dict] = []


def _current_request_ctx(user=None):
    return {"user_id": getattr(user, "id", None), "username": getattr(user, "username", None), "role": getattr(user, "role", None)}


@router.get('/', response_model=list[AgentResponse])
async def list_agents(
    status: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(Agent)
    if status:
        query = query.where(Agent.status == status)
    if search:
        query = query.where(
            or_(
                Agent.name.ilike(f"%{search}%"),
                Agent.extension.ilike(f"%{search}%"),
                Agent.email.ilike(f"%{search}%"),
            )
        )
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    agents = result.scalars().all()

    agent_ids = [agent.id for agent in agents]
    total_calls_map: dict[int, int] = {}
    if agent_ids:
        counts_result = await db.execute(
            select(CallLog.agent_id, func.count(CallLog.id))
            .where(CallLog.agent_id.in_(agent_ids))
            .group_by(CallLog.agent_id)
        )
        total_calls_map = {agent_id: int(total or 0) for agent_id, total in counts_result.all()}

    enriched = []
    for agent in agents:
        cat_result = await db.execute(
            select(Category.name, Category.id, CategoryAgent.id, CategoryAgent.override_weight)
            .join(CategoryAgent, CategoryAgent.category_id == Category.id)
            .where(CategoryAgent.agent_id == agent.id)
        )
        rows = cat_result.all()
        categories = [
            {"id": cat_id, "name": name, "weight": override_weight, "assignment_id": ca_id}
            for name, cat_id, ca_id, override_weight in rows
        ]

        enriched.append(
            AgentResponse(
                id=agent.id,
                name=agent.name,
                extension=agent.extension,
                email=agent.email,
                status=agent.status,
                total_calls=total_calls_map.get(agent.id, 0),
                categories=categories,
                category_assignments=categories,
            )
        )
    return enriched


@router.post('/', response_model=AgentResponse, status_code=201)
async def create_agent(
    data: AgentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = await db.execute(select(Agent).where(Agent.extension == data.extension))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Extension {data.extension} already exists")

    agent = Agent(**data.model_dump())
    db.add(agent)
    await db.flush()
    await db.refresh(agent)

    ctx = _current_request_ctx(current_user)
    log_audit(
        db=db,
        action="create",
        resource_type="agent",
        resource_id=agent.id,
        details={"name": agent.name, "extension": agent.extension},
        **ctx,
        flush=True,
    )
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        extension=agent.extension,
        email=agent.email,
        status=agent.status,
        categories=[],
    )


@router.get("/{agent_id}/", response_model=AgentResponse)
async def get_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    cat_rows = []
    if getattr(agent, 'category_agents', None):
        for ca in agent.category_agents:
            cat = await db.get(Category, ca.category_id)
            cat_rows.append({
                "id": cat.id if cat else None,
                "name": cat.name if cat else "Unknown",
                "weight": ca.override_weight,
                "assignment_id": ca.id,
            })
    else:
        result = await db.execute(
            select(Category.name, Category.id, CategoryAgent.id, CategoryAgent.override_weight)
            .join(CategoryAgent, CategoryAgent.category_id == Category.id)
            .where(CategoryAgent.agent_id == agent.id)
        )
        cat_rows = [
            {"id": cat_id, "name": name, "weight": override_weight, "assignment_id": ca_id}
            for name, cat_id, ca_id, override_weight in result.all()
        ]

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        extension=agent.extension,
        email=agent.email,
        status=agent.status,
        total_calls=0,
        categories=cat_rows,
        category_assignments=cat_rows,
    )


@router.put("/{agent_id}/", response_model=AgentResponse)
async def update_agent(
    agent_id: int,
    data: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = data.model_dump(exclude_unset=True)
    old = {"name": agent.name, "email": agent.email, "status": agent.status}
    for key, value in update_data.items():
        setattr(agent, key, value)

    await db.flush()
    await db.refresh(agent)

    log_audit(
        db=db,
        action="update",
        resource_type="agent",
        resource_id=agent.id,
        details={"old": old, "new": {"name": agent.name, "email": agent.email, "status": agent.status}},
        **_current_request_ctx(current_user),
    )
    await db.flush()

    cat_result = await db.execute(
        select(Category.name, Category.id, CategoryAgent.id, CategoryAgent.override_weight)
        .join(CategoryAgent, CategoryAgent.category_id == Category.id)
        .where(CategoryAgent.agent_id == agent.id)
    )
    rows = cat_result.all()
    categories = [
        {"id": cat_id, "name": name, "weight": override_weight, "assignment_id": ca_id}
        for name, cat_id, ca_id, override_weight in rows
    ]

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        extension=agent.extension,
        email=agent.email,
        status=agent.status,
        categories=categories,
        category_assignments=categories,
    )


@router.delete("/{agent_id}/", status_code=204)
async def delete_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    logs = await db.execute(select(CallLog).where(CallLog.agent_id == agent_id))
    for log in logs.scalars().all():
        await db.delete(log)

    assignments = await db.execute(select(CategoryAgent).where(CategoryAgent.agent_id == agent_id))
    for assignment in assignments.scalars().all():
        await db.delete(assignment)

    await db.delete(agent)
    await db.commit()

    log_audit(
        db=db,
        action="delete",
        resource_type="agent",
        resource_id=agent_id,
        details={"name": agent.name, "extension": agent.extension},
        **_current_request_ctx(current_user),
    )
    await db.flush()


@router.post("/{agent_id}/deactivate/", response_model=AgentResponse)
async def deactivate_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.status = "inactive"
    await db.flush()
    await db.refresh(agent)

    log_audit(
        db=db,
        action="status_change",
        resource_type="agent",
        resource_id=agent.id,
        details={"status": "inactive"},
        **_current_request_ctx(current_user),
    )
    await db.flush()

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        extension=agent.extension,
        email=agent.email,
        status=agent.status,
        categories=[],
    )


@router.post("/{agent_id}/activate/", response_model=AgentResponse)
async def activate_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.status = "active"
    await db.flush()
    await db.refresh(agent)

    log_audit(
        db=db,
        action="status_change",
        resource_type="agent",
        resource_id=agent.id,
        details={"status": "active"},
        **_current_request_ctx(current_user),
    )
    await db.flush()

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        extension=agent.extension,
        email=agent.email,
        status=agent.status,
        categories=[],
    )


@router.get("/{agent_id}/stats/", response_model=AgentStatsResponse)
async def get_agent_stats(agent_id: int, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    total_calls = (await db.execute(select(func.count(CallLog.id)).where(CallLog.agent_id == agent_id))).scalar() or 0
    answered_calls = (await db.execute(
        select(func.count(CallLog.id)).where(CallLog.agent_id == agent_id, CallLog.call_end != None)
    )).scalar() or 0
    missed_calls = total_calls - answered_calls

    avg_duration = (await db.execute(
        select(func.avg(CallLog.duration_sec)).where(CallLog.agent_id == agent_id)
    )).scalar() or 0

    categories_result = await db.execute(
        select(
            Category.id.label("category_id"),
            Category.name.label("category_name"),
            func.count(CallLog.id).label("total_calls"),
        )
        .outerjoin(CategoryAgent, and_(CategoryAgent.category_id == Category.id, CategoryAgent.agent_id == agent_id))
        .outerjoin(CallLog, and_(CallLog.agent_id == agent_id, CallLog.category_id == Category.id))
        .where(Category.id.is_not(None))
        .group_by(Category.id, Category.name)
    )

    categories = [
        {
            "id": row.category_id,
            "name": row.category_name,
            "total_calls": row.total_calls or 0,
        }
        for row in categories_result.all()
    ]

    return AgentStatsResponse(
        agent_id=agent.id,
        agent_name=agent.name,
        total_calls=total_calls,
        answered_calls=answered_calls,
        missed_calls=missed_calls,
        avg_duration=round(float(avg_duration), 2),
        categories=categories,
    )
