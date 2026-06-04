"""
Agents CRUD API — Enhanced with activate/deactivate toggle
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.agent import Agent
from app.models.caller import CallLog
from app.models.category import CategoryAgent, Category

router = APIRouter()


class AgentCreate(BaseModel):
    name: str
    extension: str
    email: str | None = None
    default_weight: int = 100


class AgentUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    default_weight: int | None = None
    status: str | None = None


class AgentResponse(BaseModel):
    id: int
    name: str
    extension: str
    email: str | None
    default_weight: int
    status: str
    categories: list[dict] = []

    class Config:
        from_attributes = True


class AgentStatsResponse(BaseModel):
    agent_id: int
    agent_name: str
    total_calls: int
    repeat_calls: int
    avg_duration: float


@router.get("/", response_model=list[AgentResponse])
async def list_agents(
    status: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all agents with category info"""
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

    # Enrich with category info
    enriched = []
    for agent in agents:
        cat_result = await db.execute(
            select(Category.name, Category.id)
            .join(CategoryAgent, CategoryAgent.category_id == Category.id)
            .where(CategoryAgent.agent_id == agent.id)
        )
        categories = [{"id": row.id, "name": row.name} for row in cat_result.all()]

        enriched.append(AgentResponse(
            id=agent.id, name=agent.name, extension=agent.extension,
            email=agent.email, default_weight=agent.default_weight,
            status=agent.status, categories=categories,
        ))
    return enriched


@router.post("/", response_model=AgentResponse, status_code=201)
async def create_agent(data: AgentCreate, db: AsyncSession = Depends(get_db)):
    """Create a new agent"""
    existing = await db.execute(select(Agent).where(Agent.extension == data.extension))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Extension {data.extension} already exists")

    agent = Agent(**data.model_dump())
    db.add(agent)
    await db.flush()
    await db.refresh(agent)
    return AgentResponse(**agent.__dict__, categories=[])


@router.get("/{agent_id}/", response_model=AgentResponse)
async def get_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    """Get agent details with categories"""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    cat_result = await db.execute(
        select(Category.name, Category.id)
        .join(CategoryAgent, CategoryAgent.category_id == Category.id)
        .where(CategoryAgent.agent_id == agent.id)
    )
    categories = [{"id": row.id, "name": row.name} for row in cat_result.all()]

    return AgentResponse(**agent.__dict__, categories=categories)


@router.put("/{agent_id}/", response_model=AgentResponse)
async def update_agent(agent_id: int, data: AgentUpdate, db: AsyncSession = Depends(get_db)):
    """Update an agent"""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(agent, key, value)

    await db.flush()
    await db.refresh(agent)

    cat_result = await db.execute(
        select(Category.name, Category.id)
        .join(CategoryAgent, CategoryAgent.category_id == Category.id)
        .where(CategoryAgent.agent_id == agent.id)
    )
    categories = [{"id": row.id, "name": row.name} for row in cat_result.all()]

    return AgentResponse(**agent.__dict__, categories=categories)


@router.delete("/{agent_id}/", status_code=204)
async def delete_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    """Hard delete an agent and all related records"""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Delete call logs referencing this agent
    logs = await db.execute(select(CallLog).where(CallLog.agent_id == agent_id))
    for log in logs.scalars().all():
        await db.delete(log)
    
    # Delete category-agent assignments
    assignments = await db.execute(select(CategoryAgent).where(CategoryAgent.agent_id == agent_id))
    for assignment in assignments.scalars().all():
        await db.delete(assignment)
    
    await db.delete(agent)
    await db.flush()


@router.post("/{agent_id}/deactivate/", response_model=AgentResponse)
async def deactivate_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    """Deactivate an agent"""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.status = "inactive"
    await db.flush()
    await db.refresh(agent)
    return AgentResponse(**agent.__dict__, categories=[])


@router.post("/{agent_id}/activate/", response_model=AgentResponse)
async def activate_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    """Activate an agent"""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.status = "active"
    await db.flush()
    await db.refresh(agent)
    return AgentResponse(**agent.__dict__, categories=[])


@router.get("/{agent_id}/stats/", response_model=AgentStatsResponse)
async def get_agent_stats(agent_id: int, db: AsyncSession = Depends(get_db)):
    """Get agent performance statistics"""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    total_calls = (await db.execute(
        select(func.count(CallLog.id)).where(CallLog.agent_id == agent_id)
    )).scalar() or 0

    repeat_calls = (await db.execute(
        select(func.count(CallLog.id)).where(CallLog.agent_id == agent_id, CallLog.is_repeat == True)
    )).scalar() or 0

    avg_duration = (await db.execute(
        select(func.avg(CallLog.duration_sec)).where(CallLog.agent_id == agent_id)
    )).scalar() or 0

    return AgentStatsResponse(
        agent_id=agent.id, agent_name=agent.name,
        total_calls=total_calls, repeat_calls=repeat_calls,
        avg_duration=round(float(avg_duration), 2),
    )
