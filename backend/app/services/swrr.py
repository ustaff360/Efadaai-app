import logging
import random
from typing import Any, Dict, List

from app.core.redis import get_redis

logger = logging.getLogger("routing.swrr")


class SmoothWeightedRoundRobin:
    def __init__(self) -> None:
        None

    async def next_index(self, category_id: int, items: List[Dict[str, Any]]) -> int:
        if not items:
            raise ValueError("No items for SWRR selection")

        if len(items) == 1:
            return 0

        r = await get_redis()
        key = f"swrr:state:{category_id}"
        raw = await r.hgetall(key)
        data: Dict[str, str] = raw if isinstance(raw, dict) else {}

        weights = [item.get("weight") or 0 for item in items]
        total_weight = sum(weights)
        if total_weight == 0:
            return random.randrange(len(items))

        current: List[float] = []
        for i in range(len(weights)):
            val = data.get(str(i))
            try:
                cw = float(val) if val is not None else 0.0
            except (TypeError, ValueError):
                cw = 0.0
            current.append(cw + weights[i])

        best = max(range(len(weights)), key=lambda i: current[i])
        if total_weight > 0:
            current[best] -= total_weight
        new_state = {str(i): str(current[i]) for i in range(len(weights))}
        try:
            await r.hset(key, mapping=new_state)
        except Exception as exc:
            logger.warning("SWRR state update failed for category %s: %s", category_id, exc)

        return best


async def select_next(category_id: int, items: List[Dict[str, Any]]) -> int:
    if not items:
        raise ValueError("No items")
    selector = SmoothWeightedRoundRobin()
    return await selector.next_index(category_id, items)
