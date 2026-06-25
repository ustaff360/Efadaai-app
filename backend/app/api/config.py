"""
System configuration: SMTP, AMI, and related settings.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.auth import get_current_user

router = APIRouter()

logger = logging.getLogger(__name__)


class SmtpSettings(BaseModel):
    smtp_host: str = Field(..., min_length=1, max_length=255)
    smtp_port: int = Field(..., ge=1, le=65535)
    smtp_username: str | None = Field(default=None, max_length=255)
    smtp_password: str | None = Field(default=None, max_length=255)
    smtp_from: str = Field(..., min_length=1, max_length=255)
    smtp_use_tls: bool = True

    @field_validator("smtp_from")
    @classmethod
    def validate_from(cls, v: str) -> str:
        return v.strip()


class SmtpSettingsResponse(BaseModel):
    id: int
    smtp_host: str
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_from: str
    smtp_use_tls: bool


class SmtpTestRequest(BaseModel):
    to_email: str = Field(..., max_length=255)


class SmtpTestResponse(BaseModel):
    message: str


async def _get_smtp_settings(db: AsyncSession):
    row = (
        await db.execute(
            text("SELECT * FROM smtp_settings ORDER BY id ASC LIMIT 1")
        )
    ).mappings().first()
    return row


async def _ensure_smtp_settings(db: AsyncSession) -> dict:
    row = await _get_smtp_settings(db)
    if row:
        return dict(row)

    host = getattr(settings, "SMTP_HOST", None) or ""
    port = getattr(settings, "SMTP_PORT", 587) or 587
    username = getattr(settings, "SMTP_USER", None)
    password = getattr(settings, "SMTP_PASSWORD", None)
    sender = getattr(settings, "SMTP_FROM", None) or ""

    insert = text(
        """
        INSERT INTO smtp_settings
          (smtp_host, smtp_port, smtp_username, smtp_password, smtp_from, smtp_use_tls)
        VALUES
          (:smtp_host, :smtp_port, :smtp_username, :smtp_password, :smtp_from, :smtp_use_tls)
        RETURNING *
        """
    )
    try:
        row = (
            await db.execute(
                insert,
                {
                    "smtp_host": host,
                    "smtp_port": port,
                    "smtp_username": username,
                    "smtp_password": password,
                    "smtp_from": sender,
                    "smtp_use_tls": True,
                },
            )
        ).mappings().first()
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise
    if not row:
        raise RuntimeError("Failed to create default SMTP settings")
    return dict(row)


def _masked_smtp_settings(row: dict) -> dict:
    data = dict(row)
    data['smtp_password'] = '' if data.get('smtp_password') is None else '***'
    return data


@router.get('/smtp', response_model=SmtpSettingsResponse, tags=['Config'])
async def get_smtp_config(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    try:
        settings_data = await _ensure_smtp_settings(db)
    except Exception as exc:
        logger.error('Failed to ensure smtp_settings: %s', exc)
        raise HTTPException(status_code=500, detail='SMTP configuration unavailable') from exc
    return _masked_smtp_settings(settings_data)


@router.post('/smtp', response_model=SmtpSettingsResponse, tags=['Config'])
async def save_smtp_config(payload: SmtpSettings, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    row = (
        await db.execute(
            text(
                """
                INSERT INTO smtp_settings
                  (smtp_host, smtp_port, smtp_username, smtp_password, smtp_from, smtp_use_tls)
                VALUES
                  (:smtp_host, :smtp_port, :smtp_username, :smtp_password, :smtp_from, :smtp_use_tls)
                ON CONFLICT (id) DO UPDATE SET
                  smtp_host = EXCLUDED.smtp_host,
                  smtp_port = EXCLUDED.smtp_port,
                  smtp_username = EXCLUDED.smtp_username,
                  smtp_password = EXCLUDED.smtp_password,
                  smtp_from = EXCLUDED.smtp_from,
                  smtp_use_tls = EXCLUDED.smtp_use_tls
                RETURNING *
                """
            ),
            payload.model_dump(),
        )
    )
    await db.commit()
    data = row.mappings().first()
    return _masked_smtp_settings(dict(data))


@router.post('/smtp/test', response_model=SmtpTestResponse, tags=['Config'])
async def test_smtp(payload: SmtpTestRequest, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    cfg = await _ensure_smtp_settings(db)
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.utils import formataddr

        msg = MIMEText("This is a test email from Efada.Ai.")
        msg["Subject"] = "SMTP Test"
        msg["From"] = formataddr(("Efada.Ai", cfg["smtp_from"]))
        msg["To"] = str(payload.to_email)
        port = int(cfg["smtp_port"])
        if cfg.get("smtp_use_tls"):
            server = smtplib.SMTP_SSL(cfg["smtp_host"], port, timeout=10)
        else:
            server = smtplib.SMTP(cfg["smtp_host"], port, timeout=10)
            if cfg.get("smtp_username"):
                server.ehlo()
                server.starttls()
        try:
            if cfg.get("smtp_username"):
                pwd = cfg.get("smtp_password") or ""
                server.login(cfg["smtp_username"], pwd)
            server.sendmail(cfg["smtp_from"], [str(payload.to_email)], msg.as_string())
        finally:
            try:
                server.quit()
            except Exception:
                pass
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SMTP test failed: {exc}") from exc
    return SmtpTestResponse(message="Test email sent successfully")


# ── API Key Management ──

import secrets
from datetime import datetime, timezone


class ApiKeyResponse(BaseModel):
    api_key: str
    is_active: bool
    created_at: str | None = None


async def _get_api_key(db: AsyncSession) -> str | None:
    """Get the API key from the database."""
    row = (
        await db.execute(
            text("SELECT api_key FROM api_key_config ORDER BY id ASC LIMIT 1")
        )
    ).mappings().first()
    if row and row["api_key"]:
        return row["api_key"]
    return None


async def _ensure_api_key(db: AsyncSession) -> str:
    """Ensure a default API key exists, creating it if needed."""
    key = await _get_api_key(db)
    if key:
        return key
    # Create from env var if set
    env_key = getattr(settings, "API_KEY", "") or ""
    db_key = env_key or ""
    insert = text(
        "INSERT INTO api_key_config (id, api_key) VALUES (1, :api_key) ON CONFLICT (id) DO UPDATE SET api_key = :api_key2"
    )
    await db.execute(insert, {"api_key": db_key, "api_key2": db_key})
    await db.commit()
    return db_key


@router.get("/api-key", tags=["Config"])
async def get_api_key(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get current API key (masked)."""
    key = await _ensure_api_key(db)
    row = (
        await db.execute(
            text("SELECT created_at FROM api_key_config WHERE id = 1")
        )
    ).mappings().first()
    masked = key[:4] + "****" + key[-4:] if len(key) > 8 else "****"
    return ApiKeyResponse(
        api_key=masked,
        is_active=bool(key),
        created_at=str(row["created_at"]) if row else None,
    )


@router.post("/api-key/regenerate", tags=["Config"])
async def regenerate_api_key(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Generate a new random API key."""
    new_key = secrets.token_hex(32)
    insert = text(
        "INSERT INTO api_key_config (id, api_key, updated_at) VALUES (1, :key, :now) "
        "ON CONFLICT (id) DO UPDATE SET api_key = :key2, updated_at = :now2"
    )
    now = datetime.now(timezone.utc)
    await db.execute(insert, {"key": new_key, "now": now, "key2": new_key, "now2": now})
    await db.commit()
    return ApiKeyResponse(
        api_key=new_key,
        is_active=True,
        created_at=str(now),
    )
