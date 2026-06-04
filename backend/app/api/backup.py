"""
Backup & Restore API — Export/Import full database as JSON
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from io import BytesIO
from app.core.database import get_db
from app.core.auth import get_current_admin
from app.models.agent import Agent
from app.models.category import Category, DID, CategoryAgent
from app.models.caller import Caller, CallLog, BlockList
from app.models.user import User

router = APIRouter()


def serialize_row(row, exclude=None):
    """Convert SQLAlchemy row to dict, handling datetimes"""
    exclude = exclude or set()
    data = {}
    for col in row.__table__.columns:
        if col.name in exclude:
            continue
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        data[col.name] = val
    return data


@router.get("/export/")
async def export_backup(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Export full database as JSON backup file"""
    backup = {
        "version": "1.0.0",
        "exported_at": datetime.utcnow().isoformat(),
        "exported_by": current_user.username,
        "data": {},
    }

    # Export agents
    agents = (await db.execute(select(Agent))).scalars().all()
    backup["data"]["agents"] = [serialize_row(a) for a in agents]

    # Export categories
    categories = (await db.execute(select(Category))).scalars().all()
    backup["data"]["categories"] = [serialize_row(c) for c in categories]

    # Export DIDs
    dids = (await db.execute(select(DID))).scalars().all()
    backup["data"]["dids"] = [serialize_row(d) for d in dids]

    # Export category_agents
    cat_agents = (await db.execute(select(CategoryAgent))).scalars().all()
    backup["data"]["category_agents"] = [serialize_row(ca) for ca in cat_agents]

    # Export callers
    callers = (await db.execute(select(Caller))).scalars().all()
    backup["data"]["callers"] = [serialize_row(c) for c in callers]

    # Export call_logs
    call_logs = (await db.execute(select(CallLog))).scalars().all()
    backup["data"]["call_logs"] = [serialize_row(cl) for cl in call_logs]

    # Export block_list
    block_list = (await db.execute(select(BlockList))).scalars().all()
    backup["data"]["block_list"] = [serialize_row(bl) for bl in block_list]

    # Export users (without password hashes)
    users = (await db.execute(select(User))).scalars().all()
    backup["data"]["users"] = [serialize_row(u, exclude={"password_hash"}) for u in users]

    # Create JSON file
    content = json.dumps(backup, indent=2, default=str)
    filename = f"efada_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

    return StreamingResponse(
        BytesIO(content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import/")
async def import_backup(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Import backup JSON and restore data"""
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only JSON backup files are supported")

    content = await file.read()
    try:
        backup = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    if "data" not in backup:
        raise HTTPException(status_code=400, detail="Invalid backup format — missing 'data' key")

    data = backup["data"]
    restored = {}

    try:
        # Clear existing data (in correct order for FK constraints)
        for model in [CallLog, BlockList, CategoryAgent, DID, Caller, Category, Agent]:
            rows = (await db.execute(select(model))).scalars().all()
            for row in rows:
                await db.delete(row)
        await db.flush()

        # Helper to parse datetime strings back to datetime objects
        def parse_datetimes(item, model):
            parsed = {}
            for k, v in item.items():
                if k not in {c.name for c in model.__table__.columns}:
                    continue
                col = model.__table__.columns.get(k)
                if v and isinstance(v, str) and hasattr(col.type, 'python_type'):
                    try:
                        if col.type.python_type is datetime:
                            v = datetime.fromisoformat(v)
                    except (ValueError, TypeError):
                        pass
                parsed[k] = v
            return parsed

        # Restore agents
        if "agents" in data:
            for item in data["agents"]:
                agent = Agent(**parse_datetimes(item, Agent))
                db.add(agent)
            restored["agents"] = len(data["agents"])

        # Restore categories
        if "categories" in data:
            for item in data["categories"]:
                cat = Category(**parse_datetimes(item, Category))
                db.add(cat)
            restored["categories"] = len(data["categories"])

        await db.flush()

        # Restore DIDs
        if "dids" in data:
            for item in data["dids"]:
                did = DID(**parse_datetimes(item, DID))
                db.add(did)
            restored["dids"] = len(data["dids"])

        # Restore category_agents
        if "category_agents" in data:
            for item in data["category_agents"]:
                ca = CategoryAgent(**parse_datetimes(item, CategoryAgent))
                db.add(ca)
            restored["category_agents"] = len(data["category_agents"])

        # Restore callers
        if "callers" in data:
            for item in data["callers"]:
                caller = Caller(**parse_datetimes(item, Caller))
                db.add(caller)
            restored["callers"] = len(data["callers"])

        await db.flush()

        # Restore call_logs
        if "call_logs" in data:
            for item in data["call_logs"]:
                log = CallLog(**parse_datetimes(item, CallLog))
                db.add(log)
            restored["call_logs"] = len(data["call_logs"])

        # Restore block_list
        if "block_list" in data:
            for item in data["block_list"]:
                bl = BlockList(**parse_datetimes(item, BlockList))
                db.add(bl)
            restored["block_list"] = len(data["block_list"])

        await db.flush()

        return {
            "message": "Backup restored successfully",
            "restored": restored,
            "original_export_date": backup.get("exported_at"),
        }

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")
