"""
Routing Engine Service
Handles smooth weighted round-robin, round-robin, weighted random, sequential selection and sticky agent logic.
"""
import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.caller import Caller, CallLog, BlockList
from app.models.category import CategoryAgent, DID, Category
from app.models.agent import Agent
from app.core.redis import get_sticky_agent, set_sticky_agent
from app.core.config import settings
from app.services.audit_service import log_event
from app.services.agent_availability import build_availability_provider


logger = logging.getLogger("routing")
AUDIT_LOGGER_NAME = "routing.audit"
_audit_logger = logging.getLogger(AUDIT_LOGGER_NAME)
_availability_provider = build_availability_provider()
logger.info(
    "agent status check %s",
    "ENABLED" if settings.ENABLE_AGENT_STATUS_CHECK else "DISABLED",
    extra={"enable_agent_status_check": settings.ENABLE_AGENT_STATUS_CHECK},
)


def _as_str(value) -> str | None:
    if value is None:
        return None
    return str(value)


def _as_str_list(value) -> list[str] | None:
    if not value:
        return None
    return [str(item) for item in value]


def _as_weight_values(value) -> list[str] | None:
    if not value:
        return None
    return [str(item) for item in value]


def _audit_extra(data: dict) -> dict:
    extras = {}
    key_map = {
        "caller_id": "caller_id",
        "did": "did",
        "category": "category",
        "routing_strategy": "routing_strategy",
        "is_new_caller": "is_new_caller",
        "sticky_hit": "sticky_hit",
        "selected_agent": "selected_agent",
        "selected_extension": "selected_extension",
        "reason_for_selection": "reason_for_selection",
        "available_agents": "available_agents",
        "weights_used": "weights_used",
    }
    for src, dst in key_map.items():
        value = data.get(src)
        if value is not None:
            extras[dst] = value
    return extras


class RoutingService:
    """Core routing engine for agent selection"""

    def __init__(self, db: AsyncSession):
        self.db = db
        from app.services.swrr import SmoothWeightedRoundRobin
        from app.core.redis import get_redis
        self._swrr = SmoothWeightedRoundRobin()

    async def route_call(self, caller_number: str, dialed_number: str) -> dict:
        """
        Main routing logic:
        1. Check blocklist
        2. Lookup DID → Category
        3. Check sticky agent (repeat caller)
        4. If no sticky or sticky busy → strategy-based selection
        5. Return selected agent or blocked response
        """
        logger.info(
            "ROUTE_IN",
            extra={
                "caller_number": caller_number,
                "dialed_number": dialed_number,
            },
        )

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

        # Step 5: Apply configurable agent availability filtering.
        eligible_agents = await self._apply_availability_filter(agents, category.id)

        # Step 6: Check sticky agent (repeat caller)
        selected_agent = None
        is_repeat = False
        sticky_hit = False

        sticky_agent_id = await get_sticky_agent(caller_number, int(category.id))
        weighted_executed = False
        if sticky_agent_id:
            for agent_info in eligible_agents:
                if agent_info["agent"].id == sticky_agent_id:
                    selected_agent = agent_info["agent"]
                    is_repeat = True
                    sticky_hit = True
                    break

        # Step 7: Strategy-based selection if no sticky match
        select_reason = None
        if not selected_agent:
            if strategy == "round_robin":
                selected_agent = await self._round_robin_selection(eligible_agents, category.id)
                select_reason = "round_robin"
            elif strategy == "sequential":
                selected_agent = self._sequential_selection(eligible_agents)
                select_reason = "sequential"
            elif strategy == "weighted_random":
                selected_agent = self._weighted_random_selection(eligible_agents)
                select_reason = "weighted_random"
            elif strategy == "least_calls":
                selected_agent = self._least_calls_selection(eligible_agents)
                select_reason = "least_calls"
            elif strategy == "longest_idle":
                selected_agent = self._longest_idle_selection(eligible_agents)
                select_reason = "longest_idle"
            else:
                selected_agent = await self._smooth_weighted_round_robin(eligible_agents, category.id)
                select_reason = "smooth_weighted_rr"
            weighted_executed = True

        logger.info(
            "routing decision",
            extra={
                "caller": caller_number,
                "category_id": category.id,
                "strategy": strategy,
                "selected_agent_id": selected_agent.id,
                "is_repeat": is_repeat,
                "eligible_agent_ids": [a["agent"].id for a in eligible_agents],
                "eligible_agent_weights": [a["weight"] for a in eligible_agents],
            },
        )

        # Step 8: Update caller tracking
        await self._update_caller(caller_number)

        # Step 9: Write call log
        await self._write_call_log(caller_number, selected_agent.id, category.id, is_repeat)

        # Step 10: Audit selection decision (non-blocking)
        try:
            routing_strategy_label = "sticky" if sticky_hit else select_reason or "weighted"
            reason_for_selection = select_reason or ("sticky hit" if sticky_hit else "weighted")
            await log_event(
                self.db,
                caller_id=caller_number,
                did=dialed_number,
                category=category.name if category else None,
                routing_strategy=routing_strategy_label,
                is_new_caller=not is_repeat,
                sticky_hit=sticky_hit,
                available_agents=[a["agent"].extension for a in eligible_agents],
                weights_used=[a["weight"] for a in eligible_agents],
                selected_agent=selected_agent.name if selected_agent else None,
                selected_extension=selected_agent.extension if selected_agent else None,
                reason_for_selection=reason_for_selection,
            )
        except Exception as audit_exc:
            logger.exception("audit log failed: %s", audit_exc)

        # Step 11: Set sticky agent
        await set_sticky_agent(caller_number, category.id, selected_agent.id, settings.STICKY_WINDOW_DAYS)

        return self._build_response(selected_agent, category, is_repeat, strategy)

    async def _apply_availability_filter(self, agents: list[dict], category_id: int) -> list[dict]:
        filtered = await _availability_provider.filter_by_availability(agents, category_id=category_id)
        if filtered is None:
            return agents
        return filtered or agents

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
        result = await self.db.execute(select(DID).where(DID.did_number == dialed_number))
        did = result.scalar_one_or_none()
        if not did:
            return None
        return await self.db.get(Category, did.category_id)

    async def _get_category_strategy(self, category_id: int) -> str:
        """Get routing strategy for category (from first agent assignment)"""
        result = await self.db.execute(
            select(CategoryAgent.routing_strategy)
            .where(and_(CategoryAgent.category_id == category_id, CategoryAgent.active == True))
            .limit(1)
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
        raw_rows = result.all()
        agents: list[dict] = []
        for ca, agent in raw_rows:
            weight = ca.override_weight if ca.override_weight is not None else 0
            agents.append({"agent": agent, "weight": int(weight)})
        return agents

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

    async def _smooth_weighted_round_robin(self, agents: list[dict], category_id: int) -> Agent:
        items = [{"agent": a["agent"], "weight": a["weight"]} for a in agents]
        index = await self._swrr.next_index(category_id, items)
        return items[index]["agent"]

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

    def _least_calls_selection(self, agents: list[dict]) -> Agent:
        best = min(agents, key=lambda a: a["agent"].default_weight or 0)
        return best["agent"]

    def _longest_idle_selection(self, agents: list[dict]) -> Agent:
        sorted_agents = sorted(agents, key=lambda a: a["agent"].id)
        return sorted_agents[0]["agent"]

    def _sequential_selection(self, agents: list[dict]) -> Agent:
        """Sequential selection — always pick first available (sorted by ID)"""
        sorted_agents = sorted(agents, key=lambda a: a["agent"].id)
        return sorted_agents[0]["agent"]

    async def _update_caller(self, caller_number: str):
        """Update or create caller record"""
        result = await self.db.execute(select(Caller).where(Caller.caller_number == caller_number))
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
            call_uuid=str(uuid.uuid4()),
            caller_number=caller_number,
            agent_id=agent_id,
            category_id=category_id,
            is_repeat=is_repeat,
        )
        self.db.add(log)

    async def _write_blocked_log(self, caller_number: str, dialed_number: str):
        """Write blocked call log"""
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
