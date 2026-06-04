"""
Routing API — POST /api/v1/route
The hot path: Asterisk calls this to get agent assignment
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.router import RoutingService

router = APIRouter()


class RouteRequest(BaseModel):
    caller_name: str | None = None
    caller_number: str
    dialed_number: str  # DID


@router.post("/route/")
async def route_call(request: RouteRequest, db: AsyncSession = Depends(get_db)):
    """
    Route an inbound call to the best available agent.
    Returns routing info or blocked status.
    """
    try:
        service = RoutingService(db)
        result = await service.route_call(
            caller_number=request.caller_number,
            dialed_number=request.dialed_number,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing error: {str(e)}")
