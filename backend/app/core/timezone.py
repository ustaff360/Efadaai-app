"""
Timezone utilities for business-day calculations.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings

BUSINESS_TZ = ZoneInfo(settings.BUSINESS_TIMEZONE)


def now_business() -> datetime:
    return datetime.now(BUSINESS_TZ)


def today_start() -> datetime:
    now = now_business()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def today_end() -> datetime:
    return now_business()
