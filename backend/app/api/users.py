"""
User Management API — Admin CRUD for users
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import hash_password, get_current_admin, get_current_user
from app.models.user import User

router = APIRouter()


# --- Schemas ---

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6)
    full_name: str | None = None
    role: str = "viewer"


class UserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    role: str | None = None
    status: str | None = None


class UserListItem(BaseModel):
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


# --- Endpoints ---

@router.get("/", response_model=list[UserListItem])
async def list_users(
    search: str | None = None,
    role: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)"""
    query = select(User)

    if search:
        query = query.where(
            or_(
                User.username.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.full_name.ilike(f"%{search}%"),
            )
        )
    if role:
        query = query.where(User.role == role)
    if status:
        query = query.where(User.status == status)

    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        UserListItem(
            id=u.id,
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            status=u.status,
            last_login=u.last_login.isoformat() if u.last_login else None,
            created_at=u.created_at.isoformat(),
        )
        for u in users
    ]


@router.post("/", response_model=UserListItem, status_code=201)
async def create_user(
    data: UserCreate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (admin only)"""
    # Check uniqueness
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    existing_email = await db.execute(select(User).where(User.email == data.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists")

    valid_roles = ["admin", "manager", "agent", "viewer"]
    if data.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        status="active",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return UserListItem(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        last_login=None,
        created_at=user.created_at.isoformat(),
    )


@router.get("/{user_id}/", response_model=UserListItem)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get user by ID (admin only)"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserListItem(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        last_login=user.last_login.isoformat() if user.last_login else None,
        created_at=user.created_at.isoformat(),
    )


@router.put("/{user_id}/", response_model=UserListItem)
async def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update user (admin only)"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = data.model_dump(exclude_unset=True)

    # Validate role if being changed
    if "role" in update_data and update_data["role"] not in ["admin", "manager", "agent", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    # Validate status if being changed
    if "status" in update_data and update_data["status"] not in ["active", "inactive"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    # Prevent admin from deactivating themselves
    if "status" in update_data and update_data["status"] == "inactive" and user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    for key, value in update_data.items():
        setattr(user, key, value)

    await db.flush()
    await db.refresh(user)

    return UserListItem(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        last_login=user.last_login.isoformat() if user.last_login else None,
        created_at=user.created_at.isoformat(),
    )


@router.delete("/{user_id}/", status_code=204)
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete user (admin only)"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    await db.delete(user)
    await db.commit()


@router.post("/{user_id}/reset-password/")
async def reset_user_password(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset user password to default (admin only)"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Reset to a default password (user should change on next login)
    default_password = "changeme123"
    user.password_hash = hash_password(default_password)
    await db.flush()

    return {"message": f"Password reset to '{default_password}'", "new_password": default_password}
