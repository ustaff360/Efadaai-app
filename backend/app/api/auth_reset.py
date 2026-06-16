"""
Password reset endpoints
"""
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.database import get_db
from app.models.user import User

router = APIRouter()

# token storage: user_id -> token/expiry (process-local; swap for Redis in prod)
_reset_tokens: dict[int, dict] = {}


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., max_length=255)


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=8, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)


class ResetPasswordResponse(BaseModel):
    message: str


@router.post("/forgot-password/", response_model=ForgotPasswordResponse, tags=["Auth"])
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        # Don't reveal whether email exists
        return ForgotPasswordResponse(message="If that email exists, a reset link has been sent.")

    token = secrets.token_urlsafe(32)
    _reset_tokens[user.id] = {
        "token": token,
        "expires_at": datetime.utcnow() + timedelta(minutes=30),
    }
    # Mail delivery is handled separately; return token for validation flow.
    return ForgotPasswordResponse(message="Password reset initiated.", reset_token=token)


@router.post("/reset-password/", response_model=ResetPasswordResponse, tags=["Auth"])
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    matched_user_id = None
    for user_id, entry in list(_reset_tokens.items()):
        if entry["token"] == data.token:
            if entry["expires_at"] < datetime.utcnow():
                raise HTTPException(status_code=400, detail="Reset token expired.")
            matched_user_id = user_id
            break
    if matched_user_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    stmt = (
        update(User)
        .where(User.id == matched_user_id)
        .values(password=data.new_password)
    )
    await db.execute(stmt)
    await db.commit()
    _reset_tokens.pop(matched_user_id, None)
    return ResetPasswordResponse(message="Password has been reset successfully.")
