"""
Reports API — Dashboard Stats & Export with enhanced search and time presets
"""
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone
from io import BytesIO, StringIO
import csv
from app.core.database import get_db
from app.models.caller import Caller, CallLog, BlockList
from app.models.agent import Agent
from app.models.category import Category, DID

router = APIRouter()


class SummaryResponse(BaseModel):
    total_calls: int
    total_callers: int
    repeat_callers: int
    repeat_rate: float
    blocked_calls: int
    total_agents: int
    total_categories: int
    total_dids: int
    avg_call_duration: float


class AgentStats(BaseModel):
    agent_id: int
    agent_name: str
    extension: str
    total_calls: int
    repeat_calls: int
    avg_duration: float


class CategoryStats(BaseModel):
    category_id: int
    category_name: str
    total_calls: int
    unique_callers: int
    repeat_rate: float


class DIDStats(BaseModel):
    did_id: int
    did_number: str
    category_name: str
    total_calls: int
    unique_callers: int


def get_date_range(preset: str, custom_start: str = None, custom_end: str = None):
    """Convert time preset to date range"""
    now = datetime.now(timezone.utc)

    if preset == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif preset == "yesterday":
        start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif preset == "last_7_days":
        start = now - timedelta(days=7)
        end = now
    elif preset == "last_30_days":
        start = now - timedelta(days=30)
        end = now
    elif preset == "last_90_days":
        start = now - timedelta(days=90)
        end = now
    elif preset == "custom" and custom_start:
        start = datetime.fromisoformat(custom_start)
        end = datetime.fromisoformat(custom_end) if custom_end else now
    else:
        start = now - timedelta(days=30)
        end = now

    return start, end


@router.get("/summary/", response_model=SummaryResponse)
async def get_summary(
    preset: str = Query("last_30_days"),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard summary statistics"""
    start, end = get_date_range(preset)

    total_calls = (await db.execute(
        select(func.count(CallLog.id)).where(CallLog.call_start >= start)
    )).scalar() or 0

    total_callers = (await db.execute(
        select(func.count(func.distinct(CallLog.caller_number))).where(CallLog.call_start >= start)
    )).scalar() or 0

    repeat_callers = (await db.execute(
        select(func.count(func.distinct(CallLog.caller_number)))
        .where(and_(CallLog.call_start >= start, CallLog.is_repeat == True))
    )).scalar() or 0

    blocked_calls = (await db.execute(
        select(func.count(CallLog.id)).where(and_(CallLog.call_start >= start, CallLog.is_blocked == True))
    )).scalar() or 0

    total_agents = (await db.execute(
        select(func.count(Agent.id)).where(Agent.status == "active")
    )).scalar() or 0

    total_categories = (await db.execute(
        select(func.count(Category.id)).where(Category.status == "active")
    )).scalar() or 0

    total_dids = (await db.execute(select(func.count(DID.id)))).scalar() or 0

    avg_duration = (await db.execute(
        select(func.avg(CallLog.duration_sec)).where(CallLog.call_start >= start)
    )).scalar() or 0

    repeat_rate = (repeat_callers / total_callers * 100) if total_callers > 0 else 0

    return SummaryResponse(
        total_calls=total_calls,
        total_callers=total_callers,
        repeat_callers=repeat_callers,
        repeat_rate=round(repeat_rate, 2),
        blocked_calls=blocked_calls,
        total_agents=total_agents,
        total_categories=total_categories,
        total_dids=total_dids,
        avg_call_duration=round(float(avg_duration), 2),
    )


@router.get("/agents/", response_model=list[AgentStats])
async def get_agent_stats(
    preset: str = Query("last_30_days"),
    db: AsyncSession = Depends(get_db),
):
    """Get per-agent statistics"""
    start, end = get_date_range(preset)

    result = await db.execute(
        select(
            Agent.id, Agent.name, Agent.extension,
            func.count(CallLog.id).label("total_calls"),
            func.sum(case((CallLog.is_repeat == True, 1), else_=0)).label("repeat_calls"),
            func.avg(CallLog.duration_sec).label("avg_duration"),
        )
        .outerjoin(CallLog, and_(CallLog.agent_id == Agent.id, CallLog.call_start >= start))
        .where(Agent.status == "active")
        .group_by(Agent.id, Agent.name, Agent.extension)
    )

    stats = []
    for row in result.all():
        stats.append(AgentStats(
            agent_id=row.id, agent_name=row.name, extension=row.extension,
            total_calls=row.total_calls or 0, repeat_calls=row.repeat_calls or 0,
            avg_duration=round(float(row.avg_duration or 0), 2),
        ))
    return stats


@router.get("/categories/", response_model=list[CategoryStats])
async def get_category_stats(
    preset: str = Query("last_30_days"),
    db: AsyncSession = Depends(get_db),
):
    """Get per-category statistics"""
    start, end = get_date_range(preset)

    result = await db.execute(
        select(
            Category.id, Category.name,
            func.count(CallLog.id).label("total_calls"),
            func.count(func.distinct(CallLog.caller_number)).label("unique_callers"),
            func.sum(case((CallLog.is_repeat == True, 1), else_=0)).label("repeat_calls"),
        )
        .outerjoin(CallLog, and_(CallLog.category_id == Category.id, CallLog.call_start >= start))
        .where(Category.status == "active")
        .group_by(Category.id, Category.name)
    )

    stats = []
    for row in result.all():
        repeat_rate = (row.repeat_calls / row.unique_callers * 100) if row.unique_callers > 0 else 0
        stats.append(CategoryStats(
            category_id=row.id, category_name=row.name,
            total_calls=row.total_calls or 0, unique_callers=row.unique_callers or 0,
            repeat_rate=round(repeat_rate, 2),
        ))
    return stats


@router.get("/dids/", response_model=list[DIDStats])
async def get_did_stats(
    preset: str = Query("last_30_days"),
    db: AsyncSession = Depends(get_db),
):
    """Get per-DID statistics"""
    start, end = get_date_range(preset)

    result = await db.execute(
        select(
            DID.id, DID.did_number, Category.name.label("cat_name"),
            func.count(CallLog.id).label("total_calls"),
            func.count(func.distinct(CallLog.caller_number)).label("unique_callers"),
        )
        .join(Category, DID.category_id == Category.id)
        .outerjoin(CallLog, and_(CallLog.did_id == DID.id, CallLog.call_start >= start))
        .group_by(DID.id, DID.did_number, Category.name)
    )

    stats = []
    for row in result.all():
        stats.append(DIDStats(
            did_id=row.id, did_number=row.did_number,
            category_name=row.cat_name,
            total_calls=row.total_calls or 0, unique_callers=row.unique_callers or 0,
        ))
    return stats


@router.get("/call-history/")
async def get_call_history(
    preset: str = Query("last_30_days"),
    agent_id: int | None = None,
    category_id: int | None = None,
    did_id: int | None = None,
    search: str | None = None,  # Global search: caller, agent, extension, DID, category
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get filterable call history with global search"""
    start, end = get_date_range(preset)

    query = (
        select(CallLog, Agent, Category, DID)
        .outerjoin(Agent, CallLog.agent_id == Agent.id)
        .outerjoin(Category, CallLog.category_id == Category.id)
        .outerjoin(DID, CallLog.did_id == DID.id)
        .where(CallLog.call_start >= start)
        .order_by(CallLog.call_start.desc())
    )

    if agent_id:
        query = query.where(CallLog.agent_id == agent_id)
    if category_id:
        query = query.where(CallLog.category_id == category_id)
    if did_id:
        query = query.where(CallLog.did_id == did_id)
    if search:
        query = query.where(
            or_(
                CallLog.caller_number.ilike(f"%{search}%"),
                Agent.name.ilike(f"%{search}%"),
                Agent.extension.ilike(f"%{search}%"),
                DID.did_number.ilike(f"%{search}%"),
                Category.name.ilike(f"%{search}%"),
            )
        )

    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)

    history = []
    for log, agent, category, did in result.all():
        history.append({
            "id": log.id,
            "caller_number": log.caller_number,
            "agent_name": agent.name if agent else None,
            "agent_extension": agent.extension if agent else None,
            "category_name": category.name if category else None,
            "did_number": did.did_number if did else None,
            "call_start": str(log.call_start),
            "call_end": str(log.call_end) if log.call_end else None,
            "duration_sec": log.duration_sec,
            "is_repeat": log.is_repeat,
            "is_blocked": log.is_blocked,
            "recording_path": log.recording_path,
        })
    return history


@router.get("/export/")
async def export_report(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    preset: str = Query("last_30_days"),
    db: AsyncSession = Depends(get_db),
):
    """Export report as CSV or PDF"""
    start, end = get_date_range(preset)

    result = await db.execute(
        select(CallLog, Agent, Category)
        .outerjoin(Agent, CallLog.agent_id == Agent.id)
        .outerjoin(Category, CallLog.category_id == Category.id)
        .where(CallLog.call_start >= start)
        .order_by(CallLog.call_start.desc())
    )

    rows = []
    for log, agent, category in result.all():
        rows.append({
            "Date": str(log.call_start)[:19],
            "Caller": log.caller_number,
            "Agent": agent.name if agent else "N/A",
            "Extension": agent.extension if agent else "N/A",
            "Category": category.name if category else "N/A",
            "Duration (s)": log.duration_sec,
            "Repeat": "Yes" if log.is_repeat else "No",
            "Blocked": "Yes" if log.is_blocked else "No",
        })

    if format == "csv":
        output = StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=call_report_{preset}.csv"},
        )
    elif format == "pdf":
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        elements = []
        styles = getSampleStyleSheet()

        elements.append(Paragraph(f"Call Report - {preset.replace('_', ' ').title()}", styles["Title"]))
        elements.append(Spacer(1, 12))

        total_calls = len(rows)
        repeat_calls = sum(1 for r in rows if r["Repeat"] == "Yes")
        blocked = sum(1 for r in rows if r["Blocked"] == "Yes")
        elements.append(Paragraph(f"Total: {total_calls} | Repeat: {repeat_calls} | Blocked: {blocked}", styles["Normal"]))
        elements.append(Spacer(1, 12))

        if rows:
            headers = list(rows[0].keys())
            data = [headers] + [list(r.values()) for r in rows[:100]]
            t = Table(data)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3446")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 10),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f1f5f9")),
                ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#e5e7eb")),
            ]))
            elements.append(t)

        doc.build(elements)
        buffer.seek(0)

        return Response(
            content=buffer.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=call_report_{preset}.pdf"},
        )
