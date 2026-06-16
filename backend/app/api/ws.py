"""
WebSocket API — Real-time dashboard broadcasting
"""
import json
import asyncio
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.caller import CallLog
from app.models.agent import Agent
from app.models.category import Category, DID

router = APIRouter()


class ConnectionManager:
    """Manage active WebSocket connections"""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        """Broadcast a JSON message to all connected clients"""
        data = json.dumps(message)
        to_remove = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                to_remove.append(connection)
        for c in to_remove:
            self.disconnect(c)


manager = ConnectionManager()


async def _get_dashboard_snapshot(db: AsyncSession) -> dict:
    """Build current dashboard stats snapshot"""
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=30)

    # Active calls count
    active_calls = (await db.execute(
        select(func.count(CallLog.id)).where(
            CallLog.call_end == None, CallLog.is_blocked == False
        )
    )).scalar() or 0

    # Calls in last 30 mins
    recent_calls = (await db.execute(
        select(func.count(CallLog.id)).where(CallLog.call_start >= start)
    )).scalar() or 0

    # Unique callers in last 30 mins
    unique_callers = (await db.execute(
        select(func.count(func.distinct(CallLog.caller_number))).where(CallLog.call_start >= start)
    )).scalar() or 0

    # Total agents
    total_agents = (await db.execute(
        select(func.count(Agent.id)).where(Agent.status == "active")
    )).scalar() or 0

    # Avg duration today
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    avg_duration = (await db.execute(
        select(func.avg(CallLog.duration_sec)).where(CallLog.call_start >= today_start)
    )).scalar() or 0

    return {
        "timestamp": now.isoformat(),
        "active_calls": active_calls,
        "recent_calls_30m": recent_calls,
        "unique_callers_30m": unique_callers,
        "total_agents": total_agents,
        "avg_duration": round(float(avg_duration), 2),
    }


async def broadcast_signal(message: dict):
    """Helper for other routers to send dashboard signals via WebSocket."""
    data = json.dumps(message)
    to_remove = []
    for connection in manager.active_connections:
        try:
            await connection.send_text(data)
        except Exception:
            to_remove.append(connection)
    for c in to_remove:
        manager.disconnect(c)


async def dashboard_broadcast(refresh: str = "full", event: str | None = None):
    """Broadcast a dashboard event to connected WebSocket clients."""
    payload = {
        "type": "dashboard",
        "event": event or "refresh",
        "refresh": refresh,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await broadcast_signal(payload)


@router.websocket("/dashboard/")
async def dashboard_ws(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    """
    WebSocket endpoint for dashboard clients.
    Clients receive periodic dashboard snapshots.
    """
    await manager.connect(websocket)
    try:
        # Send initial snapshot
        snapshot = await _get_dashboard_snapshot(db)
        await websocket.send_text(json.dumps({"type": "snapshot", "data": snapshot}))

        # Keep connection alive and listen for client pings
        last_broadcast = datetime.now(timezone.utc)
        broadcast_interval = timedelta(seconds=10)

        while True:
            try:
                # Wait for any incoming message (ping/pong)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                pass

            now = datetime.now(timezone.utc)
            if now - last_broadcast >= broadcast_interval:
                snapshot = await _get_dashboard_snapshot(db)
                await websocket.send_text(json.dumps({"type": "snapshot", "data": snapshot}))
                last_broadcast = now

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


@router.get("/summary/", tags=["Dashboard"])
async def get_dashboard_summary(db: AsyncSession = Depends(get_db)):
    """Get latest dashboard summary (synchronous fallback for non-WS clients)"""
    snapshot = await _get_dashboard_snapshot(db)
    return snapshot
