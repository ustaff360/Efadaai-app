"""
Audit Log API — read-only access for Admin and Supervisor
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from app.core.database import get_db
from app.models.caller import AuditLog
from app.core.auth import get_current_user

router = APIRouter()


class AuditLogResponse(BaseModel):
    id: int
    user_id: int | None
    username: str | None
    role: str | None
    action: str
    resource_type: str
    resource_id: int | None
    ip_address: str | None
    user_agent: str | None
    details: str | None
    created_at: str

    class Config:
        from_attributes = True


class AuditStatsResponse(BaseModel):
    total: int
    by_action: dict[str, int]
    by_resource: dict[str, int]


@router.get("/logs/", response_model=list[AuditLogResponse])
async def list_audit_logs(
    action: str | None = None,
    resource_type: str | None = None,
    user_id: int | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = select(AuditLog)

    if action:
        query = query.where(AuditLog.action == action)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if search:
        query = query.where(
            (AuditLog.username.ilike(f"%{search}%"))
            | (AuditLog.details_json.ilike(f"%{search}%"))
        )
    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AuditLog.created_at <= date_to)

    query = query.order_by(AuditLog.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            username=log.username,
            role=log.role,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            details=log.details_json,
            created_at=log.created_at.isoformat() if log.created_at else None,
        )
        for log in logs
    ]


@router.get("/stats/", response_model=AuditStatsResponse)
async def audit_stats(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    total = (await db.execute(select(func.count(AuditLog.id)))).scalar() or 0

    by_action_result = await db.execute(select(AuditLog.action, func.count(AuditLog.id).label("count")).group_by(AuditLog.action))
    by_action = {row.action: row.count for row in by_action_result.all()}

    by_resource_result = await db.execute(select(AuditLog.resource_type, func.count(AuditLog.id).label("count")).group_by(AuditLog.resource_type))
    by_resource = {row.resource_type: row.count for row in by_resource_result.all()}

    return AuditStatsResponse(total=total, by_action=by_action, by_resource=by_resource)
