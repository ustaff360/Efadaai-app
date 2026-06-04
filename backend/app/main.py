"""
Asterisk Smart Agent Routing & Call Distribution System
FastAPI Backend Entry Point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api import agents, categories, route, reports, callers, auth, users, search, backup
from app.api import calls as calls_api
from app.api import recordings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
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

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(search.router, prefix="/api/v1/search", tags=["Search"])
app.include_router(backup.router, prefix="/api/v1/backup", tags=["Backup"])
app.include_router(route.router, prefix="/api/v1", tags=["Routing"])
app.include_router(agents.router, prefix="/api/v1/agents", tags=["Agents"])
app.include_router(categories.router, prefix="/api/v1/categories", tags=["Categories"])
app.include_router(callers.router, prefix="/api/v1/callers", tags=["Callers"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(calls_api.router, prefix="/api/v1/calls", tags=["Calls"])
app.include_router(recordings.router, prefix="/api/v1/recordings", tags=["Recordings"])


@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "Smart Agent Routing API",
        "version": "1.0.0",
    }
