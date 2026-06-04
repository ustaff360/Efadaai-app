"""
Redis connection and helper functions
"""
import redis.asyncio as redis
from app.core.config import settings

# Redis connection pool
redis_pool = redis.ConnectionPool.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    max_connections=20,
)


async def get_redis() -> redis.Redis:
    """Get Redis connection"""
    return redis.Redis(connection_pool=redis_pool)


async def get_agent_status(extension: str) -> str:
    """Get agent status from Redis cache"""
    r = await get_redis()
    status = await r.get(f"agent_status:{extension}")
    return status or "unavailable"


async def set_agent_status(extension: str, status: str, ttl: int = 60):
    """Set agent status with TTL"""
    r = await get_redis()
    await r.setex(f"agent_status:{extension}", ttl, status)


async def get_sticky_agent(caller_number: str, category_id: int):
    """Get sticky agent for a caller in a category"""
    r = await get_redis()
    agent_id = await r.get(f"sticky:{caller_number}:{category_id}")
    return int(agent_id) if agent_id else None


async def set_sticky_agent(caller_number: str, category_id: int, agent_id: int, ttl_days: int = 30):
    """Set sticky agent with TTL"""
    r = await get_redis()
    ttl_seconds = ttl_days * 86400
    await r.setex(f"sticky:{caller_number}:{category_id}", ttl_seconds, str(agent_id))
