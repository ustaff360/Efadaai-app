"""
Routing Engine Service
Handles weighted random, round-robin, sequential selection and sticky agent logic
"""
import random
from datetime import datetime, timezone
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.caller import Caller, CallLog, BlockList
from app.models.category import CategoryAgent, DID, Category
from app.models.agent import Agent
from app.core.redis import get_agent_status, get_sticky_agent, set_sticky_agent
from app.core.config import settings


class RoutingService:
    """Core routing engine for agent selection"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def route_call(self, caller_number: str, dialed_number: str) -> dict:
        """
        Main routing logic:
        1. Check blocklist
        2. Lookup DID → Category
        3. Check sticky agent (repeat caller)
        4. If no sticky or sticky busy → strategy-based selection
        5. Return selected agent or blocked response
        """
        # Step 1: Check blocklist
        blocked = await self._check_blocklist(caller_number)
        if blocked:
            await self._write_blocked_log(caller_number, dialed_number)
            return {
                "status": "blocked",
                "caller_number": caller_number,
                "destination": blocked.destination,
                "destination_value": blocked.destination_value,
                "reason": blocked.reason,
            }

        # Step 2: Get category from DID
        category = await self._get_category_by_did(dialed_number)
        if not category:
            raise ValueError(f"No category found for DID: {dialed_number}")

        # Step 3: Get routing strategy for this category
        strategy = await self._get_category_strategy(category.id)

        # Step 4: Get agents available for this category
        agents = await self._get_category_agents(category.id)
        if not agents:
            raise ValueError(f"No agents assigned to category: {category.name}")

        # Step 5: Get idle agents
        idle_agents = await self._filter_idle_agents(agents)
        if not idle_agents:
            # All agents busy — return first agent as fallback
            selected_agent = agents[0]["agent"]
            return self._build_response(selected_agent, category, False, strategy)

        # Step 6: Check sticky agent (repeat caller)
        selected_agent = None
        is_repeat = False

        sticky_agent_id = await get_sticky_agent(caller_number, category.id)
        if sticky_agent_id:
            for agent_info in idle_agents:
                if agent_info["agent"].id == sticky_agent_id:
                    selected_agent = agent_info["agent"]
                    is_repeat = True
                    break

        # Step 7: Strategy-based selection if no sticky match
        if not selected_agent:
            if strategy == "round_robin":
                selected_agent = await self._round_robin_selection(idle_agents, category.id)
            elif strategy == "sequential":
                selected_agent = self._sequential_selection(idle_agents)
            else:  # weighted (default)
                selected_agent = self._weighted_random_selection(idle_agents)

        # Step 8: Update caller tracking
        await self._update_caller(caller_number)

        # Step 9: Write call log
        await self._write_call_log(caller_number, selected_agent.id, category.id, is_repeat)

        # Step 10: Set sticky agent
        await set_sticky_agent(caller_number, category.id, selected_agent.id, settings.STICKY_WINDOW_DAYS)

        return self._build_response(selected_agent, category, is_repeat, strategy)

    async def _check_blocklist(self, caller_number: str) -> BlockList | None:
        """Check if caller is in blocklist"""
        result = await self.db.execute(
            select(BlockList).where(
                and_(BlockList.phone_number == caller_number, BlockList.active == True)
            )
        )
        return result.scalar_one_or_none()

    async def _get_category_by_did(self, dialed_number: str) -> Category | None:
        """Lookup category by DID number"""
        result = await self.db.execute(
            select(DID).where(DID.did_number == dialed_number)
        )
        did = result.scalar_one_or_none()
        if not did:
            return None
        return await self.db.get(Category, did.category_id)

    async def _get_category_strategy(self, category_id: int) -> str:
        """Get routing strategy for category (from first agent assignment)"""
        result = await self.db.execute(
            select(CategoryAgent.routing_strategy).where(
                and_(CategoryAgent.category_id == category_id, CategoryAgent.active == True)
            ).limit(1)
        )
        row = result.scalar_one_or_none()
        return row or "weighted"

    async def _get_category_agents(self, category_id: int) -> list[dict]:
        """Get all active agents assigned to a category"""
        result = await self.db.execute(
            select(CategoryAgent, Agent)
            .join(Agent, CategoryAgent.agent_id == Agent.id)
            .where(
                and_(
                    CategoryAgent.category_id == category_id,
                    CategoryAgent.active == True,
                    Agent.status == "active",
                )
            )
        )
        agents = []
        for ca, agent in result.all():
            weight = ca.override_weight if ca.override_weight is not None else agent.default_weight
            agents.append({"agent": agent, "weight": weight})
        return agents

    async def _filter_idle_agents(self, agents: list[dict]) -> list[dict]:
        """Filter agents to only idle ones using Redis status"""
        idle_agents = []
        for agent_info in agents:
            status = await get_agent_status(agent_info["agent"].extension)
            if status == "idle":
                idle_agents.append(agent_info)
        return idle_agents

    def _weighted_random_selection(self, agents: list[dict]) -> Agent:
        """Weighted random selection among agents"""
        total_weight = sum(a["weight"] for a in agents)
        if total_weight == 0:
            return random.choice(agents)["agent"]

        rand_val = random.uniform(0, total_weight)
        cumulative = 0
        for agent_info in agents:
            cumulative += agent_info["weight"]
            if rand_val <= cumulative:
                return agent_info["agent"]
        return agents[-1]["agent"]

    async def _round_robin_selection(self, agents: list[dict], category_id: int) -> Agent:
        """Round-robin selection using Redis counter"""
        from app.core.redis import get_redis
        r = await get_redis()

        key = f"round_robin:{category_id}"
        index = await r.incr(key)

        sorted_agents = sorted(agents, key=lambda a: a["agent"].id)
        selected_index = (index - 1) % len(sorted_agents)
        return sorted_agents[selected_index]["agent"]

    def _sequential_selection(self, agents: list[dict]) -> Agent:
        """Sequential selection — always pick first available (sorted by ID)"""
        sorted_agents = sorted(agents, key=lambda a: a["agent"].id)
        return sorted_agents[0]["agent"]

    async def _update_caller(self, caller_number: str):
        """Update or create caller record"""
        result = await self.db.execute(
            select(Caller).where(Caller.caller_number == caller_number)
        )
        caller = result.scalar_one_or_none()

        if caller:
            caller.total_calls += 1
            caller.last_call_at = datetime.now(timezone.utc)
        else:
            caller = Caller(
                caller_number=caller_number,
                total_calls=1,
                last_call_at=datetime.now(timezone.utc),
            )
            self.db.add(caller)

    async def _write_call_log(self, caller_number: str, agent_id: int, category_id: int, is_repeat: bool):
        """Write call log entry"""
        log = CallLog(
            caller_number=caller_number,
            agent_id=agent_id,
            category_id=category_id,
            is_repeat=is_repeat,
        )
        self.db.add(log)

    async def _write_blocked_log(self, caller_number: str, dialed_number: str):
        """Write blocked call log"""
        # Find DID and category
        result = await self.db.execute(select(DID).where(DID.did_number == dialed_number))
        did = result.scalar_one_or_none()

        log = CallLog(
            caller_number=caller_number,
            category_id=did.category_id if did else None,
            did_id=did.id if did else None,
            is_blocked=True,
        )
        self.db.add(log)

    def _build_response(self, agent: Agent, category: Category, is_repeat: bool, strategy: str) -> dict:
        """Build API response"""
        return {
            "status": "routed",
            "agent_extension": agent.extension,
            "agent_name": agent.name,
            "agent_id": agent.id,
            "category": category.name,
            "category_id": category.id,
            "repeat": is_repeat,
            "strategy": strategy,
        }
