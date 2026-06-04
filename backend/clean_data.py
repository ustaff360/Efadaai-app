import asyncio
import sys
sys.path.insert(0, '/app')

from app.core.database import async_session
from sqlalchemy import text

async def clean():
    async with async_session() as session:
        await session.execute(text("DELETE FROM call_logs"))
        await session.execute(text("DELETE FROM category_agents"))
        await session.execute(text("DELETE FROM block_list"))
        await session.execute(text("DELETE FROM callers"))
        await session.execute(text("DELETE FROM dids"))
        await session.execute(text("DELETE FROM categories"))
        await session.execute(text("DELETE FROM agents"))
        await session.commit()
        print("All data cleaned successfully!")

asyncio.run(clean())
