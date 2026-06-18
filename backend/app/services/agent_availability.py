"""
Agent availability provider interface.

This abstraction isolates availability checks from the routing algorithm,
allowing implementations such as disabled-by-default, Redis/AMI, SIP presence, etc.
"""
from __future__ import annotations

from typing import List, Optional

from app.core.config import settings


class AgentAvailabilityProvider:
    """Base provider interface for agent availability filtering."""

    async def filter_by_availability(self, agents: list[dict], category_id: int | None = None) -> list[dict] | None:
        """
        Return a filtered list of available agents.

        - Return None to indicate the availability check is disabled;
          the caller should treat ALL agents as available.
        - Return a list (possibly empty) of the same agent dicts that are
          currently available for routing.
        """
        raise NotImplementedError


class DisabledAgentAvailabilityProvider(AgentAvailabilityProvider):
    """
    Availability check is disabled.
    All agents are treated as available regardless of any external state.
    This is the safe default when AMI/Redis status is not available.
    """

    async def filter_by_availability(self, agents: list[dict], category_id: int | None = None) -> list[dict] | None:
        return None


class RedisAgentAvailabilityProvider(AgentAvailabilityProvider):
    """
    Use Redis agent_status cache (populated by AMI/SIP watchers) to
    determine which agents are currently idle/available.
    """

    def __init__(self, agent_extensions: list[str]):
        self.agent_extensions = agent_extensions

    async def filter_by_availability(self, agents: list[dict], category_id: int | None = None) -> list[dict] | None:
        from app.core.redis import get_agent_status

        available: list[dict] = []
        for agent_info in agents:
            extension = agent_info["agent"].extension
            try:
                status = await get_agent_status(extension)
            except Exception:
                status = "idle"
            if status == "idle" or status == "unavailable":
                available.append(agent_info)
        return available or []


def build_availability_provider() -> AgentAvailabilityProvider:
    """
    Construct the availability provider based on current configuration.
    """
    if not getattr(settings, "ENABLE_AGENT_STATUS_CHECK", False):
        return DisabledAgentAvailabilityProvider()
    return RedisAgentAvailabilityProvider(agent_extensions=[])
