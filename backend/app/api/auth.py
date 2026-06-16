"""
Auth API — Login, Register, Token, Password Change
"""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, get_current_admin,
)
from app.models.user import User

router = APIRouter()


# --- Schemas ---

class LoginRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6)
    full_name: str | None = None
    role: str = "viewer"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


class ProfileUpdateRequest(BaseModel):
    email: str | None = None
    full_name: str | None = None
    current_password: str | None = None
    new_password: str | None = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str | None
    role: str
    status: str
    last_login: str | None
    created_at: str

    class Config:
        from_attributes = True


class ProfileUpdateResponse(BaseModel):
    message: str
    user: UserResponse


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# --- Endpoints ---

@router.post("/login/", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT token"""
    identifier = data.username or data.email
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username or email is required",
        )

    result = await db.execute(
        select(User).where((User.username == identifier) | (User.email == identifier))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Contact administrator.",
        )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    token = create_access_token(data={"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            status=user.status,
            last_login=user.last_login.isoformat() if user.last_login else None,
            created_at=user.created_at.isoformat(),
        ),
    )


@router.post("/register/", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user (first user always becomes admin)"""
    # Check if username exists
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    # Check if email exists
    existing_email = await db.execute(select(User).where(User.email == data.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists")

    # First user is always admin
    user_count = len((await db.execute(select(User))).scalars().all())
    if user_count == 0:
        role = "admin"
    else:
        role = data.role if data.role in ["admin", "manager", "agent", "viewer"] else "viewer"

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=role,
        status="active",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = create_access_token(data={"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            status=user.status,
            last_login=None,
            created_at=user.created_at.isoformat(),
        ),
    )


@router.get("/me/", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        status=current_user.status,
        last_login=current_user.last_login.isoformat() if current_user.last_login else None,
        created_at=current_user.created_at.isoformat(),
    )


@router.post("/change-password/")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change current user's password"""
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.password_hash = hash_password(data.new_password)
    await db.flush()

    return {"message": "Password changed successfully"}


@router.put("/profile/", response_model=ProfileUpdateResponse)
async def update_profile(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's profile (name, email, password)"""
    # Validate email uniqueness if changing
    if data.email and data.email != current_user.email:
        existing = await db.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = data.email

    # Validate current password if changing password
    if data.new_password:
        if not data.current_password:
            raise HTTPException(status_code=400, detail="Current password required to change password")
        if not verify_password(data.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        current_user.password_hash = hash_password(data.new_password)

    # Update full name
    if data.full_name is not None:
        current_user.full_name = data.full_name

    await db.flush()
    await db.refresh(current_user)

    return ProfileUpdateResponse(
        message="Profile updated successfully",
        user=UserResponse(
            id=current_user.id,
            username=current_user.username,
            email=current_user.email,
            full_name=current_user.full_name,
            role=current_user.role,
            status=current_user.status,
            last_login=current_user.last_login.isoformat() if current_user.last_login else None,
            created_at=current_user.created_at.isoformat(),
        ),
    )
