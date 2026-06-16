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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    ALGORITHM: str = "HS256"

    # App
    DEBUG: bool = False
    STICKY_WINDOW_DAYS: int = 30
    ALLOWED_ORIGINS: str = "http://localhost,http://localhost:3000,http://localhost:3002,http://localhost:83,http://127.0.0.1,http://127.0.0.1:3000,http://127.0.0.1:3002,http://127.0.0.1:83,*"

    # AMI / Routing
    ASTERISK_HOST: str = "127.0.0.1"
    ASTERISK_PORT: int = 5038
    AMI_USERNAME: str = "admin"
    AMI_PASSWORD: str = "admin123"
    POLL_INTERVAL: int = 5
    AGENT_STATUS_TTL: int = 60

    # SMTP
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: Optional[str] = None

    # Business Timezone
    BUSINESS_TIMEZONE: str = "Asia/Karachi"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()
