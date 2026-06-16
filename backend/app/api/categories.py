"""
Categories CRUD API — standard response envelope, simpler DTOs, weight-safe assignments.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, or_, func, case, and_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.category import Category, DID, CategoryAgent
from app.models.agent import Agent
from app.models.caller import CallLog
from app.core.auth import get_current_user

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    dids: list[dict] = Field(default_factory=list)
    category_agents: list[dict] = Field(default_factory=list)

    class Config:
        from_attributes = True


class SuccessResponse(BaseModel):
    success: bool = True
    message: str | None = None
    data: dict | None = None


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
    routing_strategy: str = "weighted"
    active: bool = True


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

    class Config:
        from_attributes = True


def _category_to_response(category, dids):
    return CategoryResponse(
        id=category.id,
        name=category.name,
        description=category.description,
        status=category.status,
        dids=dids,
    ).model_dump()


def ok(message: str = 'Operation completed successfully', data=None):
    return {'success': True, 'message': message, 'data': data or {}}


def fail(message: str, status=400):
    raise HTTPException(status_code=status, detail=message)


async def _active_assignments_total(category_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(CategoryAgent.override_weight).where(
            CategoryAgent.category_id == category_id,
            CategoryAgent.active == True,
        )
    )
    return sum(row[0] or 0 for row in result.all())


async def _enforce_weight_total(category_id: int, db: AsyncSession) -> None:
    total = await _active_assignments_total(category_id, db)
    if total != 100:
        raise HTTPException(
            status_code=400,
            detail=f'Weight total for active assignments must equal 100. Current total: {total}',
        )


@router.get('/', response_model=list[CategoryResponse])
async def list_categories(
    status: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(Category)
    if status:
        query = query.where(Category.status == status)
    if search:
        query = query.where(Category.name.ilike(f'%{search}%'))
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    categories = result.scalars().all()

    # Preload call counts per category
    counts_result = await db.execute(
        select(
            CallLog.category_id,
            func.count(CallLog.id).label('total_calls'),
            func.count(func.distinct(CallLog.caller_number)).label('unique_callers'),
        )
        .where(CallLog.category_id.in_([c.id for c in categories]))
        .group_by(CallLog.category_id)
    )
    counts = {row.category_id: row for row in counts_result.all()}

    enriched = []
    for cat in categories:
        dids = [{'id': d.id, 'did_number': d.did_number, 'description': d.description} for d in cat.dids]
        cat_counts = counts.get(cat.id)
        enriched.append(
            {
                'id': cat.id,
                'name': cat.name,
                'description': cat.description,
                'status': cat.status,
                'dids': dids,
                'category_agents': [
                    {
                        'id': a.id,
                        'agent_id': a.agent.id,
                        'agent_name': a.agent.name,
                        'agent_extension': a.agent.extension,
                        'override_weight': a.override_weight,
                        'active': a.active,
                    }
                    for a in getattr(cat, 'category_agents', [])
                ],
                'total_calls': cat_counts.total_calls if cat_counts else 0,
                'unique_callers': cat_counts.unique_callers if cat_counts else 0,
            }
        )
    return enriched


@router.get('/all-dids/', response_model=list[dict])
async def list_all_dids(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DID, Category).join(Category, DID.category_id == Category.id))
    stats = []
    for did, category in result.all():
        stats.append(
            {
                'id': did.id,
                'did_number': did.did_number,
                'description': did.description,
                'category_id': did.category_id,
                'category_name': category.name,
            }
        )
    return stats


@router.post('/', response_model=SuccessResponse, status_code=201)
async def create_category(data: CategoryCreate, db: AsyncSession = Depends(get_db)):
    category = Category(**data.model_dump())
    db.add(category)
    await db.flush()
    await db.refresh(category)
    dids = [{'id': d.id, 'did_number': d.did_number, 'description': d.description} for d in category.dids]
    return ok('Category created', _category_to_response(category, dids))


@router.get('/{category_id}/', response_model=CategoryResponse)
async def get_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')
    dids = [{'id': d.id, 'did_number': d.did_number, 'description': d.description} for d in category.dids]
    return _category_to_response(category, dids)


@router.put('/{category_id}/', response_model=SuccessResponse)
async def update_category(category_id: int, data: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(category, key, value)

    await db.flush()
    await db.commit()
    await db.refresh(category)
    dids = [{'id': d.id, 'did_number': d.did_number, 'description': d.description} for d in category.dids]
    return ok('Category updated', _category_to_response(category, dids))


@router.delete('/{category_id}/')
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')

    logs = await db.execute(select(CallLog).where(CallLog.category_id == category_id))
    for log in logs.scalars().all():
        await db.delete(log)

    dids = await db.execute(select(DID).where(DID.category_id == category_id))
    for did in dids.scalars().all():
        await db.delete(did)

    assignments = await db.execute(select(CategoryAgent).where(CategoryAgent.category_id == category_id))
    for assignment in assignments.scalars().all():
        await db.delete(assignment)

    await db.delete(category)
    await db.flush()
    await db.commit()
    return ok('Category deleted')


@router.post('/{category_id}/activate/', response_model=CategoryResponse)
async def activate_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')
    category.status = 'active'
    await db.flush()
    await _enforce_weight_total(category_id, db)
    await db.commit()
    await db.refresh(category)
    dids = [{'id': d.id, 'did_number': d.did_number, 'description': d.description} for d in category.dids]
    return _category_to_response(category, dids)


@router.post('/{category_id}/deactivate/', response_model=CategoryResponse)
async def deactivate_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')
    category.status = 'inactive'
    await db.flush()
    await db.commit()
    await db.refresh(category)
    dids = [{'id': d.id, 'did_number': d.did_number, 'description': d.description} for d in category.dids]
    return _category_to_response(category, dids)


@router.post('/{category_id}/dids/', response_model=DIDResponse, status_code=201)
async def add_did(category_id: int, data: DIDCreate, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')

    existing = await db.execute(select(DID).where(DID.did_number == data.did_number))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f'DID {data.did_number} already exists')

    did = DID(did_number=data.did_number, description=data.description, category_id=category_id)
    db.add(did)
    await db.flush()
    await db.refresh(did)
    return did


@router.put('/{category_id}/dids/{did_id}/', response_model=DIDResponse)
async def update_did(category_id: int, did_id: int, data: DIDUpdate, db: AsyncSession = Depends(get_db)):
    did = await db.get(DID, did_id)
    if not did or did.category_id != category_id:
        raise HTTPException(status_code=404, detail='DID not found')

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(did, key, value)

    await db.flush()
    await db.refresh(did)
    return did


@router.delete('/{category_id}/dids/{did_id}/', status_code=204)
async def remove_did(category_id: int, did_id: int, db: AsyncSession = Depends(get_db)):
    did = await db.get(DID, did_id)
    if not did or did.category_id != category_id:
        raise HTTPException(status_code=404, detail='DID not found')

    logs = await db.execute(select(CallLog).where(CallLog.did_id == did_id))
    for log in logs.scalars().all():
        await db.delete(log)

    await db.delete(did)
    await db.flush()
    await db.commit()


@router.get('/{category_id}/agents/', response_model=list[AgentAssignmentResponse])
async def list_category_agents(category_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CategoryAgent, Agent)
        .join(Agent, CategoryAgent.agent_id == Agent.id)
        .where(CategoryAgent.category_id == category_id)
    )
    assignments = []
    for ca, agent in result.all():
        assignments.append(
            AgentAssignmentResponse(
                id=ca.id,
                agent_id=agent.id,
                agent_name=agent.name,
                agent_extension=agent.extension,
                override_weight=ca.override_weight,
                routing_strategy=ca.routing_strategy,
                active=ca.active,
            )
        )
    return assignments


@router.post('/{category_id}/agents/', response_model=SuccessResponse, status_code=201)
async def assign_agent(category_id: int, data: AgentAssignment, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')

    agent = await db.get(Agent, data.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail='Agent not found')

    existing = await db.execute(
        select(CategoryAgent).where(
            CategoryAgent.category_id == category_id,
            CategoryAgent.agent_id == data.agent_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail='Agent already assigned to this category')

    assignment = CategoryAgent(
        category_id=category_id,
        agent_id=data.agent_id,
        override_weight=data.override_weight,
        routing_strategy=data.routing_strategy,
        active=data.active,
    )
    db.add(assignment)
    await db.flush()
    await db.commit()
    await db.refresh(assignment)
    return ok('Agent assigned', {'id': assignment.id})


@router.put('/{category_id}/agents/{assignment_id}/', response_model=SuccessResponse)
async def update_agent_assignment(category_id: int, assignment_id: int, data: AgentAssignmentUpdate, db: AsyncSession = Depends(get_db)):
    assignment = await db.get(CategoryAgent, assignment_id)
    if not assignment or assignment.category_id != category_id:
        raise HTTPException(status_code=404, detail='Assignment not found')

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(assignment, key, value)

    await db.flush()
    await db.commit()
    await db.refresh(assignment)
    return ok('Assignment updated')


@router.delete('/{category_id}/agents/{assignment_id}/')
async def unassign_agent(category_id: int, assignment_id: int, db: AsyncSession = Depends(get_db)):
    assignment = await db.get(CategoryAgent, assignment_id)
    if not assignment or assignment.category_id != category_id:
        raise HTTPException(status_code=404, detail='Assignment not found')
    await db.delete(assignment)
    await db.flush()
    await db.commit()
    return ok('Agent unassigned')
