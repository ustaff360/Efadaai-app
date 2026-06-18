import asyncio

from app.services.swrr import SmoothWeightedRoundRobin


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    async def hgetall(self, key: str) -> dict[str, str]:
        return dict(self.store)

    async def hset(self, key: str, mapping: dict[str, str]) -> None:
        self.store.update(mapping)


def _override_get_redis(fake_redis):
    import app.services.swrr as swrr
    async def _fake_get_redis():
        return fake_redis
    swrr.get_redis = _fake_get_redis


def test_equal_weights_near_equal_distribution():
    async def run():
        fake_redis = FakeRedis()
        _override_get_redis(fake_redis)
        selector = SmoothWeightedRoundRobin()
        items = [{"id": 1, "weight": 25}, {"id": 2, "weight": 25}, {"id": 3, "weight": 25}, {"id": 4, "weight": 25}]

        counts = {1: 0, 2: 0, 3: 0, 4: 0}
        for _ in range(400):
            idx = await selector.next_index(10, items)
            counts[items[idx]["id"]] += 1

        min_count, max_count = min(counts.values()), max(counts.values())
        assert max_count - min_count <= 30

    asyncio.run(run())


def test_unequal_weights_match_ratios():
    async def run():
        fake_redis = FakeRedis()
        _override_get_redis(fake_redis)
        selector = SmoothWeightedRoundRobin()
        items = [{"id": 1, "weight": 20}, {"id": 2, "weight": 30}, {"id": 3, "weight": 50}]

        counts = {1: 0, 2: 0, 3: 0}
        total = 0
        for _ in range(1000):
            idx = await selector.next_index(20, items)
            counts[items[idx]["id"]] += 1
            total += 1

        ratio_1 = counts[1] / total
        assert abs(ratio_1 - 0.2) <= 0.05

    asyncio.run(run())


if __name__ == "__main__":
    test_equal_weights_near_equal_distribution()
    test_unequal_weights_match_ratios()
    print("SWRR tests passed")
