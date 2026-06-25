"""
Reports API — Dashboard Stats & Export with enhanced search and time presets
"""
from fastapi import APIRouter, Depends, Query, Response, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone
from io import BytesIO, StringIO
import csv
from app.core.database import get_db
from app.core.timezone import today_start, now_business
from app.models.caller import Caller, CallLog, BlockList
from app.models.agent import Agent
from app.models.category import Category, DID, CategoryAgent

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
    weight: float | None = None
    total_calls: int
    repeat_calls: int
    avg_duration: float


class CategoryStats(BaseModel):
    category_id: int
    category_name: str
    total_calls: int
    unique_callers: int
    repeat_rate: float
    total_agents: int
    today_calls: int


class DIDStats(BaseModel):
    did_id: int
    did_number: str
    category_name: str
    total_calls: int
    unique_callers: int


def get_date_range(preset: str, custom_start: str = None, custom_end: str = None):
    """Convert time preset to date range"""
    now = now_business()

    if preset == "today":
        start = today_start()
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
    agent_id: int | None = None,
    category_id: int | None = None,
    did_id: int | None = None,
    custom_start: str | None = None,
    custom_end: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard summary statistics"""
    start, end = get_date_range(preset, custom_start, custom_end)

    base = CallLog.call_start >= start
    if agent_id:
        base = and_(base, CallLog.agent_id == agent_id)
    if category_id:
        base = and_(base, CallLog.category_id == category_id)
    if did_id:
        base = and_(base, CallLog.did_id == did_id)

    total_calls = (await db.execute(
        select(func.count(CallLog.id)).where(base)
    )).scalar() or 0

    total_callers = (await db.execute(
        select(func.count(func.distinct(CallLog.caller_number))).where(base)
    )).scalar() or 0

    repeat_callers = (await db.execute(
        select(func.count(func.distinct(CallLog.caller_number)))
        .where(and_(base, CallLog.is_repeat == True))
    )).scalar() or 0

    blocked_calls = (await db.execute(
        select(func.count(CallLog.id)).where(and_(base, CallLog.is_blocked == True))
    )).scalar() or 0

    total_agents = (await db.execute(
        select(func.count(Agent.id)).where(Agent.status == "active")
    )).scalar() or 0

    total_categories = (await db.execute(
        select(func.count(Category.id)).where(Category.status == "active")
    )).scalar() or 0

    total_dids = (await db.execute(select(func.count(DID.id)))).scalar() or 0

    avg_duration = (await db.execute(
        select(func.avg(CallLog.duration_sec)).where(base)
    )).scalar() or 0

    repeat_rate = (repeat_callers / total_calls * 100) if total_calls > 0 else 0

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
    agent_id: int | None = None,
    category_id: int | None = None,
    did_id: int | None = None,
    custom_start: str | None = None,
    custom_end: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get per-agent statistics"""
    start, end = get_date_range(preset, custom_start or "", custom_end or "")

    call_filter = and_(CallLog.agent_id == Agent.id, CallLog.call_start >= start)
    if agent_id:
        call_filter = and_(call_filter, CallLog.agent_id == agent_id)
    if category_id:
        call_filter = and_(call_filter, CallLog.category_id == category_id)
    if did_id:
        call_filter = and_(call_filter, CallLog.did_id == did_id)

    result = await db.execute(
        select(
            Agent.id, Agent.name, Agent.extension,
            func.count(CallLog.id).label("total_calls"),
            func.sum(case((CallLog.is_repeat == True, 1), else_=0)).label("repeat_calls"),
            func.avg(CallLog.duration_sec).label("avg_duration"),
        )
        .outerjoin(CallLog, call_filter)
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


class AgentSummaryResponse(BaseModel):
    agent_id: int
    agent_name: str
    extension: str
    total_calls: int
    unique_callers: int
    repeat_calls: int
    repeat_rate: float
    avg_duration: float
    today_calls: int


@router.get("/agents/summary/", response_model=list[AgentSummaryResponse])
async def get_agent_summary(
    preset: str = Query("last_30_days"),
    agent_id: int | None = None,
    category_id: int | None = None,
    did_id: int | None = None,
    custom_start: str | None = None,
    custom_end: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get agent summary across all categories with today calls"""
    start, end = get_date_range(preset, custom_start or "", custom_end or "")

    call_filter = and_(CallLog.agent_id == Agent.id, CallLog.call_start >= start)
    if agent_id:
        call_filter = and_(call_filter, CallLog.agent_id == agent_id)
    if category_id:
        call_filter = and_(call_filter, CallLog.category_id == category_id)
    if did_id:
        call_filter = and_(call_filter, CallLog.did_id == did_id)

    result = await db.execute(
        select(
            Agent.id, Agent.name, Agent.extension,
            func.count(CallLog.id).label("total_calls"),
            func.count(func.distinct(CallLog.caller_number)).label("unique_callers"),
            func.sum(case((CallLog.is_repeat == True, 1), else_=0)).label("repeat_calls"),
            func.avg(CallLog.duration_sec).label("avg_duration"),
        )
        .outerjoin(CallLog, call_filter)
        .where(Agent.status == "active")
        .group_by(Agent.id, Agent.name, Agent.extension)
    )

    today_start_dt = today_start()
    today_result = await db.execute(
        select(
            CallLog.agent_id,
            func.count(CallLog.id).label("today_calls"),
        )
        .where(CallLog.call_start >= today_start_dt)
        .group_by(CallLog.agent_id)
    )
    today_map = {row.agent_id: row.today_calls for row in today_result.all()}

    summary = []
    for row in result.all():
        repeat_rate = (row.repeat_calls / row.unique_callers * 100) if row.unique_callers > 0 else 0
        summary.append(AgentSummaryResponse(
            agent_id=row.id,
            agent_name=row.name,
            extension=row.extension,
            total_calls=row.total_calls or 0,
            unique_callers=row.unique_callers or 0,
            repeat_calls=row.repeat_calls or 0,
            repeat_rate=round(repeat_rate, 2),
            avg_duration=round(float(row.avg_duration or 0), 2),
            today_calls=today_map.get(row.id, 0),
        ))
    return summary


@router.get("/categories/", response_model=list[CategoryStats])
async def get_category_stats(
    preset: str = Query("last_30_days"),
    agent_id: int | None = None,
    category_id: int | None = None,
    did_id: int | None = None,
    custom_start: str | None = None,
    custom_end: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get per-category statistics"""
    start, end = get_date_range(preset, custom_start or "", custom_end or "")

    call_filter = and_(CallLog.category_id == Category.id, CallLog.call_start >= start)
    if category_id:
        call_filter = and_(call_filter, CallLog.category_id == category_id)
    if agent_id:
        call_filter = and_(call_filter, CallLog.agent_id == agent_id)
    if did_id:
        call_filter = and_(call_filter, CallLog.did_id == did_id)

    result = await db.execute(
        select(
            Category.id, Category.name,
            func.count(func.distinct(CallLog.id)).label("total_calls"),
            func.count(func.distinct(CallLog.caller_number)).label("unique_callers"),
            func.sum(case((CallLog.is_repeat == True, 1), else_=0)).label("repeat_calls"),
            func.count(func.distinct(CategoryAgent.agent_id)).label("total_agents"),
        )
        .outerjoin(CallLog, call_filter)
        .outerjoin(CategoryAgent, CategoryAgent.category_id == Category.id)
        .where(Category.status == "active")
        .group_by(Category.id, Category.name)
    )

    today_start_dt = today_start()
    today_result = await db.execute(
        select(
            CallLog.category_id,
            func.count(CallLog.id).label("today_calls"),
        )
        .where(CallLog.call_start >= today_start_dt)
        .group_by(CallLog.category_id)
    )
    today_map = {row.category_id: row.today_calls for row in today_result.all()}

    stats = []
    for row in result.all():
        repeat_rate = (row.repeat_calls / row.unique_callers * 100) if row.unique_callers > 0 else 0
        stats.append(
            CategoryStats(
                category_id=row.id,
                category_name=row.name,
                total_calls=row.total_calls or 0,
                unique_callers=row.unique_callers or 0,
                repeat_rate=round(repeat_rate, 2),
                total_agents=row.total_agents or 0,
                today_calls=today_map.get(row.id, 0),
            )
        )
    return stats


@router.get("/categories/{category_id}/")
async def get_category_report(category_id: int, preset: str = Query("last_30_days"), db: AsyncSession = Depends(get_db)):
    """Get detailed category report with recent call history"""
    start, end = get_date_range(preset)

    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    total_calls = (await db.execute(
        select(func.count(CallLog.id)).where(and_(CallLog.category_id == category_id, CallLog.call_start >= start))
    )).scalar() or 0

    unique_callers = (await db.execute(
        select(func.count(func.distinct(CallLog.caller_number))).where(and_(CallLog.category_id == category_id, CallLog.call_start >= start))
    )).scalar() or 0

    repeat_calls = (await db.execute(
        select(func.count(func.distinct(CallLog.caller_number)))
        .where(and_(CallLog.category_id == category_id, CallLog.call_start >= start, CallLog.is_repeat == True))
    )).scalar() or 0

    repeat_rate = (repeat_calls / unique_callers * 100) if unique_callers > 0 else 0

    agent_stats = {}
    agent_result = await db.execute(
        select(
            Agent.id, Agent.name, Agent.extension,
            CategoryAgent.override_weight,
            func.count(CallLog.id).label("total_calls"),
            func.sum(case((CallLog.is_repeat == True, 1), else_=0)).label("repeat_calls"),
            func.avg(CallLog.duration_sec).label("avg_duration"),
        )
        .outerjoin(CallLog, and_(CallLog.agent_id == Agent.id, CallLog.category_id == category_id, CallLog.call_start >= start))
        .join(CategoryAgent, and_(CategoryAgent.agent_id == Agent.id, CategoryAgent.category_id == category_id))
        .group_by(Agent.id, Agent.name, Agent.extension, CategoryAgent.override_weight)
    )
    for row in agent_result.all():
        agent_stats[row.id] = {
            "agent_id": row.id,
            "agent_name": row.name,
            "extension": row.extension,
            "weight": row.override_weight,
            "total_calls": row.total_calls or 0,
            "repeat_calls": row.repeat_calls or 0,
            "avg_duration": round(float(row.avg_duration or 0), 2),
        }
    assigned_agents = await db.execute(
        select(CategoryAgent, Agent).join(Agent, CategoryAgent.agent_id == Agent.id).where(CategoryAgent.category_id == category_id)
    )
    assignments = []
    for ca, agent in assigned_agents.all():
        assignments.append({
            "id": ca.id,
            "agent_id": agent.id,
            "agent_name": agent.name,
            "agent_extension": agent.extension,
            "override_weight": ca.override_weight,
            "routing_strategy": ca.routing_strategy,
            "active": ca.active,
        })

    agent_ids = [c["agent_id"] for c in assignments]
    today_counts = {}
    if agent_ids:
        today_counts = dict(
            (
                await db.execute(
                    select(
                        CallLog.agent_id,
                        func.count(CallLog.id).label("today_calls"),
                    )
                    .where(
                        and_(
                            CallLog.category_id == category_id,
                            CallLog.agent_id.in_(agent_ids),
                            CallLog.call_start >= today_start(),
                        )
                    )
                    .group_by(CallLog.agent_id)
                )
            ).all()
        )

    for agent_id, stats in agent_stats.items():
        stats["today_calls"] = int(today_counts.get(agent_id, 0) or 0)

    dids = [{"id": d.id, "did_number": d.did_number, "description": d.description} for d in category.dids]
    recent_calls = (await db.execute(
        select(
            CallLog.id, CallLog.caller_number, CallLog.call_start, CallLog.duration_sec,
            Agent.name.label("agent_name"), Agent.extension.label("agent_extension"),
        )
        .outerjoin(Agent, CallLog.agent_id == Agent.id)
        .where(and_(CallLog.category_id == category_id, CallLog.call_start >= start))
        .order_by(CallLog.call_start.desc()).limit(50)
    )).all()
    history = []
    for row in recent_calls:
        history.append({
            "id": row.id,
            "caller_number": row.caller_number,
            "caller_name": None,
            "agent_name": row.agent_name,
            "agent_extension": row.agent_extension,
            "category_name": category.name,
            "did_number": None,
            "call_start": str(row.call_start),
            "call_end": None,
            "duration_sec": row.duration_sec,
            "is_repeat": None,
            "is_blocked": None,
            "recording_path": None,
        })

    return {
        "id": category.id,
        "name": category.name,
        "description": category.description,
        "status": category.status,
        "dids": dids,
        "summary": {
            "total_calls": total_calls,
            "unique_callers": unique_callers,
            "repeat_calls": repeat_calls,
            "repeat_rate": round(repeat_rate, 2),
            "total_agents": len(assignments),
            "today_calls": (await db.execute(
                select(func.count(CallLog.id)).where(
                    and_(CallLog.category_id == category_id, CallLog.call_start >= today_start())
                )
            )).scalar() or 0,
        },
        "agent_stats": list(agent_stats.values()),
        "assignments": assignments,
        "history": history,
    }


@router.get("/dids/", response_model=list[DIDStats])
async def get_did_stats(
    preset: str = Query("last_30_days"),
    agent_id: int | None = None,
    category_id: int | None = None,
    did_id: int | None = None,
    custom_start: str | None = None,
    custom_end: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get per-DID statistics"""
    start, end = get_date_range(preset, custom_start or "", custom_end or "")

    join_cond = and_(CallLog.did_id == DID.id, CallLog.call_start >= start)
    if agent_id:
        join_cond = and_(join_cond, CallLog.agent_id == agent_id)
    if category_id:
        join_cond = and_(join_cond, CallLog.category_id == category_id)

    result = await db.execute(
        select(
            DID.id, DID.did_number, Category.name.label("cat_name"),
            func.count(CallLog.id).label("total_calls"),
            func.count(func.distinct(CallLog.caller_number)).label("unique_callers"),
        )
        .join(Category, DID.category_id == Category.id)
        .outerjoin(CallLog, join_cond)
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
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get filterable call history with global search"""
    start, end = get_date_range(preset)

    query = (
        select(
            CallLog.id,
            CallLog.caller_number,
            CallLog.call_start,
            CallLog.call_end,
            CallLog.duration_sec,
            CallLog.is_repeat,
            CallLog.is_blocked,
            CallLog.recording_path,
            Agent.name.label("agent_name"),
            Agent.extension.label("agent_extension"),
            Category.name.label("category_name"),
            DID.did_number.label("did_number"),
        )
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
    for row in result.all():
        history.append(
            {
                "id": row.id,
                "caller_number": row.caller_number,
                "caller_name": None,
                "agent_name": row.agent_name,
                "agent_extension": row.agent_extension,
                "category_name": row.category_name,
                "did_number": row.did_number,
                "call_start": str(row.call_start),
                "call_end": str(row.call_end) if row.call_end else None,
                "duration_sec": row.duration_sec,
                "is_repeat": row.is_repeat,
                "is_blocked": row.is_blocked,
                "recording_path": row.recording_path,
            }
        )
    return history


@router.get("/export/")
async def export_report(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    preset: str = Query("last_30_days"),
    agent_id: int | None = None,
    category_id: int | None = None,
    did_id: int | None = None,
    custom_start: str | None = None,
    custom_end: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Export report as CSV or PDF"""
    start, end = get_date_range(preset, custom_start or "", custom_end or "")

    base = CallLog.call_start >= start
    if agent_id:
        base = and_(base, CallLog.agent_id == agent_id)
    if category_id:
        base = and_(base, CallLog.category_id == category_id)
    if did_id:
        base = and_(base, CallLog.did_id == did_id)

    result = await db.execute(
        select(CallLog, Agent, Category, DID)
        .outerjoin(Agent, CallLog.agent_id == Agent.id)
        .outerjoin(Category, CallLog.category_id == Category.id)
        .outerjoin(DID, CallLog.did_id == DID.id)
        .where(base)
        .order_by(CallLog.call_start.desc())
    )

    rows = []
    for log, agent, category, did in result.all():
        rows.append({
            "Date": str(log.call_start)[:19],
            "Caller": log.caller_number,
            "Agent": agent.name if agent else "N/A",
            "Extension": agent.extension if agent else "N/A",
            "DID Number": did.did_number if did else "N/A",
            "Category": category.name if category else "N/A",
            "Duration (s)": log.duration_sec,
            "Repeat": "Yes" if log.is_repeat else "No",
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
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.6*inch, bottomMargin=0.5*inch)
        elements = []
        styles = getSampleStyleSheet()

        # ── Title ──
        title_style = ParagraphStyle('ReportTitle', parent=styles['Title'], fontSize=20, spaceAfter=4, textColor=colors.HexColor("#1a3446"))
        elements.append(Paragraph(f"Call Report — {preset.replace('_', ' ').title()}", title_style))

        # Subtitle with filter info
        filter_parts = []
        if agent_id:
            # Fetch agent name for display
            agent_result = await db.execute(select(Agent.name).where(Agent.id == agent_id))
            agent_name = agent_result.scalar_one_or_none() or f"Agent #{agent_id}"
            filter_parts.append(f"Agent: {agent_name}")
        if category_id:
            cat_result = await db.execute(select(Category.name).where(Category.id == category_id))
            cat_name = cat_result.scalar_one_or_none() or f"Category #{category_id}"
            filter_parts.append(f"Category: {cat_name}")
        sub_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor("#64748b"), spaceAfter=16)
        subtitle = " | ".join(filter_parts) if filter_parts else f"{start.strftime('%b %d, %Y')} – {end.strftime('%b %d, %Y')}"
        elements.append(Paragraph(subtitle, sub_style))

        # ── Summary Stats Cards ──
        total_callers = len(set(r["Caller"] for r in rows))
        repeat_calls = sum(1 for r in rows if r["Repeat"] == "Yes")
        repeat_rate = f"{(repeat_calls / len(rows) * 100):.1f}%" if rows else "0%"
        today_calls = sum(1 for r in rows if r["Date"].startswith(str(datetime.utcnow().date())))

        stats_data = [
            ["Total Calls", "Unique Callers", "Repeat Calls", "Repeat Rate", "Today Calls"],
            [
                str(len(rows)),
                str(total_callers),
                str(repeat_calls),
                repeat_rate,
                str(today_calls),
            ],
        ]
        stats_table = Table(stats_data, colWidths=[1.2*inch]*5)
        stats_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3446")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, 1), 14),
            ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#1a3446")),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 1), (-1, 1), 10),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
            ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#e5e7eb")),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f8fafc")),
        ]))
        elements.append(stats_table)
        elements.append(Spacer(1, 16))

        # ── Call Details Table ──
        if rows:
            detail_style = ParagraphStyle('SectionTitle', parent=styles['Normal'], fontSize=12, fontName='Helvetica-Bold', textColor=colors.HexColor("#1a3446"), spaceAfter=8)
            elements.append(Paragraph("Call Details", detail_style))

            detail_headers = ["Date", "Caller", "Agent", "DID", "Category", "Duration", "Repeat"]
            detail_data = [[
                r["Date"][:10] if len(r["Date"]) > 10 else r["Date"],
                r["Caller"],
                r["Agent"],
                r["DID Number"],
                r["Category"],
                str(r["Duration (s)"]) + "s",
                "✓" if r["Repeat"] == "Yes" else "—",
            ] for r in rows[:100]]

            data = [detail_headers] + detail_data
            t = Table(data, colWidths=[1*inch, 0.9*inch, 0.9*inch, 0.9*inch, 0.9*inch, 0.6*inch, 0.5*inch])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3446")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
                ("TOPPADDING", (0, 1), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
            ]))
            elements.append(t)

        doc.build(elements)
        buffer.seek(0)

        return Response(
            content=buffer.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=call_report_{preset}.pdf"},
        )
