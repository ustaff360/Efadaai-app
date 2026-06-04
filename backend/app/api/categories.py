"""
Categories CRUD API — Enhanced with routing strategies, DID edit, better forms
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.category import Category, DID, CategoryAgent
from app.models.agent import Agent
from app.models.caller import CallLog

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None
    customer_name: str | None = None
    contact_number: str | None = None
    owner_email: str | None = None
    locations: list[str] = []


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    customer_name: str | None = None
    contact_number: str | None = None
    owner_email: str | None = None
    locations: list[str] | None = None
    status: str | None = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    description: str | None
    customer_name: str | None
    contact_number: str | None
    owner_email: str | None
    locations: list[str]
    status: str

    class Config:
        from_attributes = True


class DIDCreate(BaseModel):
    did_number: str
    description: str | None = None


class DIDUpdate(BaseModel):
    did_number: str | None = None
    description: str | None = None


class DIDResponse(BaseModel):
    id: int
    did_number: str
    description: str | None
    category_id: int

    class Config:
        from_attributes = True


class AgentAssignment(BaseModel):
    agent_id: int
    override_weight: int | None = None
    routing_strategy: str = "weighted"  # weighted, round_robin, sequential


class AgentAssignmentUpdate(BaseModel):
    override_weight: int | None = None
    routing_strategy: str | None = None
    active: bool | None = None


class AgentAssignmentResponse(BaseModel):
    id: int
    agent_id: int
    agent_name: str
    agent_extension: str
    override_weight: int | None
    routing_strategy: str
    active: bool


@router.get("/", response_model=list[CategoryResponse])
async def list_categories(
    status: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all categories"""
    query = select(Category)
    if status:
        query = query.where(Category.status == status)
    if search:
        query = query.where(Category.name.ilike(f"%{search}%"))
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=CategoryResponse, status_code=201)
async def create_category(data: CategoryCreate, db: AsyncSession = Depends(get_db)):
    """Create a new category/business"""
    category = Category(**data.model_dump())
    db.add(category)
    await db.flush()
    await db.refresh(category)
    return category


@router.get("/{category_id}/", response_model=CategoryResponse)
async def get_category(category_id: int, db: AsyncSession = Depends(get_db)):
    """Get category details"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.put("/{category_id}/", response_model=CategoryResponse)
async def update_category(category_id: int, data: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    """Update a category"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(category, key, value)

    await db.flush()
    await db.refresh(category)
    return category


@router.delete("/{category_id}/", status_code=204)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    """Hard delete a category and all related records"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Delete call logs referencing this category
    logs = await db.execute(select(CallLog).where(CallLog.category_id == category_id))
    for log in logs.scalars().all():
        await db.delete(log)
    
    # Delete DIDs belonging to this category
    dids = await db.execute(select(DID).where(DID.category_id == category_id))
    for did in dids.scalars().all():
        await db.delete(did)
    
    # Delete category-agent assignments
    assignments = await db.execute(select(CategoryAgent).where(CategoryAgent.category_id == category_id))
    for assignment in assignments.scalars().all():
        await db.delete(assignment)
    
    await db.delete(category)
    await db.flush()


@router.post("/{category_id}/activate/", response_model=CategoryResponse)
async def activate_category(category_id: int, db: AsyncSession = Depends(get_db)):
    """Activate a category"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.status = "active"
    await db.flush()
    await db.refresh(category)
    return category


@router.post("/{category_id}/deactivate/", response_model=CategoryResponse)
async def deactivate_category(category_id: int, db: AsyncSession = Depends(get_db)):
    """Deactivate a category"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.status = "inactive"
    await db.flush()
    await db.refresh(category)
    return category


# DID endpoints
@router.get("/{category_id}/dids/", response_model=list[DIDResponse])
async def list_category_dids(category_id: int, db: AsyncSession = Depends(get_db)):
    """List DIDs for a category"""
    result = await db.execute(select(DID).where(DID.category_id == category_id))
    return result.scalars().all()


@router.post("/{category_id}/dids/", response_model=DIDResponse, status_code=201)
async def add_did(category_id: int, data: DIDCreate, db: AsyncSession = Depends(get_db)):
    """Add a DID to a category"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    existing = await db.execute(select(DID).where(DID.did_number == data.did_number))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"DID {data.did_number} already exists")

    did = DID(did_number=data.did_number, description=data.description, category_id=category_id)
    db.add(did)
    await db.flush()
    await db.refresh(did)
    return did


@router.put("/{category_id}/dids/{did_id}/", response_model=DIDResponse)
async def update_did(category_id: int, did_id: int, data: DIDUpdate, db: AsyncSession = Depends(get_db)):
    """Update a DID"""
    did = await db.get(DID, did_id)
    if not did or did.category_id != category_id:
        raise HTTPException(status_code=404, detail="DID not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(did, key, value)

    await db.flush()
    await db.refresh(did)
    return did


@router.delete("/{category_id}/dids/{did_id}/", status_code=204)
async def remove_did(category_id: int, did_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a DID from a category and all related call logs"""
    did = await db.get(DID, did_id)
    if not did or did.category_id != category_id:
        raise HTTPException(status_code=404, detail="DID not found")
    
    # Delete call logs referencing this DID
    logs = await db.execute(select(CallLog).where(CallLog.did_id == did_id))
    for log in logs.scalars().all():
        await db.delete(log)
    
    await db.delete(did)
    await db.flush()


# Agent assignment endpoints
@router.get("/{category_id}/agents/", response_model=list[AgentAssignmentResponse])
async def list_category_agents(category_id: int, db: AsyncSession = Depends(get_db)):
    """List agents assigned to a category"""
    result = await db.execute(
        select(CategoryAgent, Agent)
        .join(Agent, CategoryAgent.agent_id == Agent.id)
        .where(CategoryAgent.category_id == category_id)
    )
    assignments = []
    for ca, agent in result.all():
        assignments.append(AgentAssignmentResponse(
            id=ca.id,
            agent_id=agent.id,
            agent_name=agent.name,
            agent_extension=agent.extension,
            override_weight=ca.override_weight,
            routing_strategy=ca.routing_strategy,
            active=ca.active,
        ))
    return assignments


@router.post("/{category_id}/agents/", status_code=201)
async def assign_agent(category_id: int, data: AgentAssignment, db: AsyncSession = Depends(get_db)):
    """Assign an agent to a category"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    agent = await db.get(Agent, data.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    existing = await db.execute(
        select(CategoryAgent).where(
            CategoryAgent.category_id == category_id,
            CategoryAgent.agent_id == data.agent_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Agent already assigned to this category")

    assignment = CategoryAgent(
        category_id=category_id,
        agent_id=data.agent_id,
        override_weight=data.override_weight,
        routing_strategy=data.routing_strategy,
    )
    db.add(assignment)
    await db.flush()
    return {"message": "Agent assigned", "assignment_id": assignment.id}


@router.put("/{category_id}/agents/{assignment_id}/")
async def update_agent_assignment(category_id: int, assignment_id: int, data: AgentAssignmentUpdate, db: AsyncSession = Depends(get_db)):
    """Update agent assignment (weight, strategy, active)"""
    assignment = await db.get(CategoryAgent, assignment_id)
    if not assignment or assignment.category_id != category_id:
        raise HTTPException(status_code=404, detail="Assignment not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(assignment, key, value)

    await db.flush()
    return {"message": "Assignment updated"}


@router.delete("/{category_id}/agents/{assignment_id}/", status_code=204)
async def unassign_agent(category_id: int, assignment_id: int, db: AsyncSession = Depends(get_db)):
    """Remove an agent from a category"""
    assignment = await db.get(CategoryAgent, assignment_id)
    if not assignment or assignment.category_id != category_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(assignment)
    await db.flush()
