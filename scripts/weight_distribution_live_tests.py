#!/usr/bin/env python3
"""Distribution validation using the live category weights from production."""
import collections
import json
import time
import urllib.request


BASE = "http://127.0.0.1:8002"


LIVE_TESTS = [
    {
        "name": "Test 1: DID 6312461100 live weights 50 / 50",
        "did": "6312461100",
        "category_id": 3,
        "live_agents": [
            {"agent_id": 1, "extension": "1001", "name": "Mawra", "weight": 50},
            {"agent_id": 2, "extension": "1002", "name": "John", "weight": 50},
        ],
        "calls": 100,
    },
    {
        "name": "Test 2: DID 6312460800 live weights 50 / 30 / 20",
        "did": "6312460800",
        "category_id": 4,
        "live_agents": [
            {"agent_id": 3, "extension": "1003", "name": "Ali", "weight": 50},
            {"agent_id": 4, "extension": "1004", "name": "Anna", "weight": 30},
            {"agent_id": 5, "extension": "1005", "name": "Sara", "weight": 20},
        ],
        "calls": 100,
    },
    {
        "name": "Test 3: DID 6312460606 live weights 25 / 25 / 25 / 25",
        "did": "6312460606",
        "category_id": 2,
        "live_agents": [
            {"agent_id": 1, "extension": "1001", "name": "Mawra", "weight": 25},
            {"agent_id": 2, "extension": "1002", "name": "John", "weight": 25},
            {"agent_id": 5, "extension": "1005", "name": "Sara", "weight": 25},
            {"agent_id": 6, "extension": "1006", "name": "Anthony", "weight": 25},
        ],
        "calls": 100,
    },
    {
        "name": "Test 4: DID 6312461111 live weights 50 / 25 / 25",
        "did": "6312461111",
        "category_id": 10,
        "live_agents": [
            {"agent_id": 7, "extension": "1007", "name": "Agent 7", "weight": 50},
            {"agent_id": 8, "extension": "1008", "name": "Agent8", "weight": 25},
            {"agent_id": 9, "extension": "1009", "name": "Agent9", "weight": 25},
        ],
        "calls": 100,
    },
]


def call_route(did, caller_id):
    url = f"{BASE}/api/v1/route/"
    payload = json.dumps({"caller_id": caller_id, "did": did}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode())


def run_test(test):
    did = test["did"]
    calls = test["calls"]
    counts = collections.Counter()
    results = []
    errors = []
    first_caller = None
    first_agent = None
    for idx in range(1, calls + 1):
        caller_id = f"{idx:010d}"
        try:
            result = call_route(did, caller_id)
        except Exception as exc:
            errors.append(str(exc))
            results.append({"caller_id": caller_id, "error": str(exc)})
            continue
        agent_id = result.get("agent_id")
        agent_name = result.get("agent_name")
        extension = result.get("agent_extension")
        category_id = result.get("category_id")
        strategy = result.get("strategy")
        repeat = result.get("repeat")
        status = result.get("status")
        if first_caller is None:
            first_caller = caller_id
            first_agent = agent_id
        if status == "routed" and agent_id is not None:
            counts[agent_id] += 1
        results.append(
            {
                "caller_id": caller_id,
                "agent_id": agent_id,
                "agent_name": agent_name,
                "extension": extension,
                "category_id": category_id,
                "strategy": strategy,
                "repeat": repeat,
            }
        )
        time.sleep(0.02)

    # Use int keys consistently
    agent_counts = {str(agent["agent_id"]): counts.get(agent["agent_id"], 0) for agent in test["live_agents"]}
    report = {
        "did": did,
        "category_id": test["category_id"],
        "live_agents": test["live_agents"],
        "total_calls": calls,
        "routed_calls": sum(counts.values()),
        "agent_counts": agent_counts,
        "first_caller": first_caller,
        "first_agent": first_agent,
        "errors": errors[:10],
        "result_error_count": len(errors),
    }
    return report, results


def distribution_ok(report, test):
    total_weights = sum(agent["weight"] for agent in test["live_agents"])
    total = report["routed_calls"]
    if total < 20:
        return False, "too few routed calls"
    for agent in test["live_agents"]:
        expected = total * agent["weight"] / total_weights
        got = report["agent_counts"].get(str(agent["agent_id"]), 0)
        tol = max(0.25 * total / total_weights, 1)
        if abs(got - expected) > tol:
            return False, f"{agent['name']} ({agent['extension']}): expected {expected:.1f}, got {got}"
    return True, "within tolerance"


def main():
    for test in LIVE_TESTS:
        print(f"RUN\t{test['name']}")
        report, results = run_test(test)
        ok, msg = distribution_ok(report, test)
        report["distribution_ok"] = ok
        report["distribution_reason"] = msg
        print(json.dumps(report, indent=2))
        rows = ["CALL\tCALLER\tAGENT_ID\tEXT\tSTRATEGY\tREPEAT"]
        for r in results[:20]:
            rows.append(
                f"{r['caller_id']}\t{r['caller_id']}\t{r.get('agent_id')}\t{r.get('extension')}\t{r.get('strategy')}\t{r.get('repeat')}"
            )
        rows.append("# ...")
        print("\n".join(rows))
        print()


if __name__ == "__main__":
    main()
