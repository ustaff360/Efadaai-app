"""
Global Search API — searches across agents, callers, DIDs, categories
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.agent import Agent
from app.models.caller import Caller
from app.models.category import Category, DID
from app.models.user import User

router = APIRouter()


class SearchResult(BaseModel):
    type: str  # agent, caller, did, category
    id: int
    title: str
    subtitle: str | None = None
    url: str  # frontend route path


@router.get("/", response_model=list[SearchResult])
async def global_search(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search across agents, callers, DIDs, and categories"""
    query = f"%{q}%"
    results = []
    per_type = max(3, limit // 4)

    # Search Agents
    agent_result = await db.execute(
        select(Agent)
        .where(or_(
            Agent.name.ilike(query),
            Agent.extension.ilike(query),
            Agent.email.ilike(query),
        ))
        .limit(per_type)
    )
    for a in agent_result.scalars().all():
        results.append(SearchResult(
            type="agent",
            id=a.id,
            title=a.name,
            subtitle=f"Ext: {a.extension}" + (f" • {a.email}" if a.email else ""),
            url=f"/agents",
        ))

    # Search Callers
    caller_result = await db.execute(
        select(Caller)
        .where(or_(
            Caller.caller_number.ilike(query),
            Caller.caller_name.ilike(query),
        ))
        .limit(per_type)
    )
    for c in caller_result.scalars().all():
        results.append(SearchResult(
            type="caller",
            id=c.id,
            title=c.caller_number,
            subtitle=c.caller_name or f"{c.total_calls} calls",
            url=f"/callers",
        ))

    # Search DIDs
    did_result = await db.execute(
        select(DID, Category.name.label("cat_name"))
        .join(Category, DID.category_id == Category.id)
        .where(or_(
            DID.did_number.ilike(query),
            DID.description.ilike(query),
        ))
        .limit(per_type)
    )
    for row in did_result.all():
        did = row[0]
        results.append(SearchResult(
            type="did",
            id=did.id,
            title=did.did_number,
            subtitle=f"{row.cat_name}" + (f" • {did.description}" if did.description else ""),
            url=f"/categories",
        ))

    # Search Categories
    cat_result = await db.execute(
        select(Category)
        .where(or_(
            Category.name.ilike(query),
            Category.customer_name.ilike(query),
        ))
        .limit(per_type)
    )
    for c in cat_result.scalars().all():
        results.append(SearchResult(
            type="category",
            id=c.id,
            title=c.name,
            subtitle=c.customer_name or "Category",
            url=f"/categories",
        ))

    return results[:limit]
