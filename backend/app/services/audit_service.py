"""
Non-blocking audit service for routing decisions.

Captures:
- caller_id
- did
- category
- routing_strategy
- is_new_caller
- sticky_hit
- available_agents
- weights_used
- selected_agent
- selected_extension
- reason_for_selection
- timestamp
"""
import json
from datetime import datetime, timezone
from app.models.agent_selection_audit import AgentSelectionAudit
from app.core.database import AsyncSession


async def log_event(
    db: AsyncSession,
    *,
    caller_id: str,
    did: str | None,
    category: str | None,
    routing_strategy: str,
    is_new_caller: bool,
    sticky_hit: bool,
    available_agents: list[str] | None,
    weights_used: list[int | None] | None,
    selected_agent: str | None,
    selected_extension: str | None,
    reason_for_selection: str | None,
) -> None:
    payload = {
        "caller_id": caller_id,
        "did": did,
        "category": category,
        "routing_strategy": routing_strategy,
        "is_new_caller": is_new_caller,
        "sticky_hit": sticky_hit,
        "available_agents": available_agents,
        "weights_used": weights_used,
        "selected_agent": selected_agent,
        "selected_extension": selected_extension,
        "reason_for_selection": reason_for_selection,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    # Defensive serialization: stash structured data for later queryability.
    ses = json.dumps(payload, ensure_ascii=True, default=str)
    passable = json.dumps(payload, default=str)
    audit = AgentSelectionAudit(
        caller_id=caller_id,
        did=did,
        category=category,
        routing_strategy=routing_strategy,
        is_new_caller=is_new_caller,
        sticky_hit=sticky_hit,
        available_agents=ses,
        weights_used=passable,
        selected_agent=selected_agent,
        selected_extension=selected_extension,
        reason_for_selection=reason_for_selection,
    )
    db.add(audit)
