"""
Routing API - POST /api/v1/route, POST /api/v1/get-agent

The hot path: Asterisk calls this to get agent assignment
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.router import RoutingService
from app.api.ws import dashboard_broadcast

router = APIRouter()


class RouteRequest(BaseModel):
    caller_name: str | None = None
    caller_id: str
    did: str


def _log(msg: str, **extra):
    print(f"TRACE|{msg}|{extra}")


class GetAgentResponse(BaseModel):
    success: bool = True
    category: str | None = None
    agent_name: str | None = None
    extension: str | None = None
    error: str | None = None


def _as_get_agent_response(result: object) -> GetAgentResponse:
    if isinstance(result, dict):
        status = result.get('status')
        if status == 'routed':
            return GetAgentResponse(
                success=True,
                category=result.get('category'),
                agent_name=result.get('agent_name'),
                extension=result.get('agent_extension'),
            )
        if status == 'blocked':
            return GetAgentResponse(
                success=False,
                category=result.get('category'),
                agent_name=result.get('agent_name'),
                extension=None,
                error=result.get('reason') or 'Blocked caller',
            )
        if result.get('success') is False or result.get('error'):
            return GetAgentResponse(
                success=False,
                category=result.get('category'),
                agent_name=result.get('agent_name'),
                extension=result.get('agent_extension'),
                error=result.get('error') or result.get('detail'),
            )
        return GetAgentResponse(
            success=True,
            category=result.get('category'),
            agent_name=result.get('agent_name'),
            extension=result.get('agent_extension'),
        )
    return GetAgentResponse(success=True)


@router.post("/route/")
async def route_call(request: RouteRequest, db: AsyncSession = Depends(get_db)):
    """Route an inbound call to the best available agent."""
    try:
        _log("STAGE_A_IN", caller_id=request.caller_id, did=request.did)
        service = RoutingService(db)
        result = await service.route_call(
            caller_number=request.caller_id,
            dialed_number=request.did,
        )
        _log("STAGE_C_DECISION", result=result)
        await db.flush()
        await db.commit()
        try:
            await dashboard_broadcast(refresh="full", event="new_call_routed")
        except Exception:
            pass
        _log("STAGE_D_OUT", response=result)
        return result
    except ValueError as e:
        try:
            await db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Routing error: {str(e)}")


@router.post("/get-agent/", response_model=GetAgentResponse)
async def get_agent_alias(request: RouteRequest, db: AsyncSession = Depends(get_db)):
    """Plan-defined alias: POST /api/v1/get-agent with {caller_id, did}."""
    try:
        result = await route_call(request, db)
        payload = result if isinstance(result, dict) else {}
        success = payload.get("status") == "routed"
        debug = {
            "caller_id": request.caller_id,
            "did": request.did,
            "result": payload,
        }
        print("DEBUG get_agent_alias", debug)
        return GetAgentResponse(
            success=success,
            category=payload.get("category"),
            agent_name=payload.get("agent_name"),
            extension=payload.get("agent_extension"),
        )
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        raise


@router.post("/call-completed/")
async def call_completed_alias(payload: dict):
    """Placeholder completion endpoint.

    Note: for full completion behavior use /api/v1/calls/terminate via CallLog lookup.
    """
    caller_number = payload.get("caller_id") or payload.get("caller_number") or ""
    agent = payload.get("agent")
    duration = payload.get("duration", 0)
    status = payload.get("status", "ANSWERED")
    if isinstance(duration, str) and duration.isdigit():
        duration = int(duration)
    return {
        "success": True,
        "caller_number": caller_number,
        "agent": agent,
        "duration": duration,
        "status": status,
    }


# No-slash canonical aliases for Asterisk and integration callers
router.post("/get-agent", include_in_schema=False)(get_agent_alias)
router.post("/route", include_in_schema=False)(route_call)
router.post("/call-completed", include_in_schema=False)(call_completed_alias)
router.post("/call-completed/", include_in_schema=False)(call_completed_alias)
