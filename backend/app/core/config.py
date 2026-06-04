"""
Application configuration using Pydantic Settings
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://routing_user:password@localhost:5432/asterisk_routing"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security
    SECRET_KEY: str = "change-this-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALGORITHM: str = "HS256"

    # App
    DEBUG: bool = False
    STICKY_WINDOW_DAYS: int = 30
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost"

    # SMTP (Phase 3)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: Optional[str] = None

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
