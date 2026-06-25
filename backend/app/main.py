"""
Asterisk Smart Agent Routing & Call Distribution System
FastAPI Backend Entry Point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine, Base
from app.api import agents, categories, route, reports, callers, auth, users, search, backup, audit, config, auth_reset
from app.api import calls as calls_api
from app.api import recordings
from app.api import ws
from app.core.auth import verify_api_key


INIT_SQL = [
    """
    CREATE TABLE IF NOT EXISTS smtp_settings (
      id INT PRIMARY KEY DEFAULT 1,
      smtp_host VARCHAR(255) NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 587,
      smtp_username VARCHAR(255) DEFAULT NULL,
      smtp_password VARCHAR(255) DEFAULT NULL,
      smtp_from VARCHAR(255) NOT NULL DEFAULT '',
      smtp_use_tls BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ami_config (
      id INT PRIMARY KEY DEFAULT 1,
      asterisk_host VARCHAR(255) NOT NULL DEFAULT '127.0.0.1',
      asterisk_port INTEGER NOT NULL DEFAULT 5038,
      ami_username VARCHAR(255) NOT NULL DEFAULT 'admin',
      ami_password VARCHAR(255) NOT NULL DEFAULT '',
      poll_interval INTEGER NOT NULL DEFAULT 5,
      agent_status_ttl INTEGER NOT NULL DEFAULT 60,
      sticky_window_days INTEGER NOT NULL DEFAULT 30,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS api_key_config (
      id INT PRIMARY KEY DEFAULT 1,
      api_key VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
    """,
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in INIT_SQL:
            await conn.execute(text(stmt))
    yield
    await engine.dispose()


app = FastAPI(
    title="Smart Agent Routing API",
    description="Enterprise-grade agent selection and call routing engine for Asterisk PBX",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public routers (no auth required)
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(auth_reset.router, prefix="/api/v1/auth", tags=["Auth", "PasswordReset"])

# JWT-protected routers (user session required)
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(search.router, prefix="/api/v1/search", tags=["Search"])
app.include_router(agents.router, prefix="/api/v1/agents", tags=["Agents"])
app.include_router(categories.router, prefix="/api/v1/categories", tags=["Categories"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["Audit"])
app.include_router(config.router, prefix="/api/v1/config", tags=["Config"])

# API-key-protected routers (X-API-Key header required when configured)
app.include_router(route.router, prefix="/api/v1", tags=["Routing"], dependencies=[Depends(verify_api_key)])
app.include_router(callers.router, prefix="/api/v1/callers", tags=["Callers"], dependencies=[Depends(verify_api_key)])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"], dependencies=[Depends(verify_api_key)])
app.include_router(calls_api.router, prefix="/api/v1/calls", tags=["Calls"], dependencies=[Depends(verify_api_key)])
app.include_router(recordings.router, prefix="/api/v1/recordings", tags=["Recordings"], dependencies=[Depends(verify_api_key)])
app.include_router(backup.router, prefix="/api/v1/backup", tags=["Backup"], dependencies=[Depends(verify_api_key)])

# WebSocket router
app.include_router(ws.router, prefix="/api/v1/ws", tags=["WebSocket"])


@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "Smart Agent Routing API",
        "version": "1.0.0",
    }
