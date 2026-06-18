#!/usr/bin/env python3
"""
Deterministic weighted-distribution validation for the routing API.

Usage:
  python weight_distribution_validation.py --base http://127.0.0.1:8002 --did 6312460800 --calls 100

Requirements:
- target DID must resolve in that backend to a category with weighted agents matching the test weights below.
- backend must be reachable from this environment.
"""

import argparse
import collections
import json
import math
import random
import sys
import time
import urllib.request


TESTS = [
    {
        "name": "Test 1 on DID 6312461100: 50 / 50, 100 calls",
        "did": "6312461100",
        "calls": 100,
        "weights": (50, 50),
    },
    {
        "name": "Test 2 on DID 6312460800: 50 / 30 / 20, 100 calls",
        "did": "6312460800",
        "calls": 100,
        "weights": (50, 30, 20),
    },
    {
        "name": "Test 3 on DID 6312460606: 25 / 25 / 25 / 25, 100 calls",
        "did": "6312460606",
        "calls": 100,
        "weights": (25, 25, 25, 25),
    },
    {
        "name": "Test 4 on DID 6312461111: 50 / 25 / 25, 100 calls",
        "did": "6312461111",
        "calls": 100,
        "weights": (50, 25, 25),
    },
]


def call_route(base, did, caller_id):
    url = f"{base}/api/v1/route/"
    payload = json.dumps({"caller_id": caller_id, "did": did}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode())


def run_test(base, did, calls, weights):
    counts = collections.Counter()
    repeated_counts = collections.Counter()
    results = []
    errors = []
    # first caller used
    first_caller = None
    first_agent = None
    for idx in range(1, calls + 1):
        caller_id = f"{idx:010d}"
        try:
            result = call_route(base, did, caller_id)
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

        if status == "routed":
            counts[agent_id] += 1
            if repeat is True:
                repeated_counts[agent_id] += 1

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

    report = {
        "did": did,
        "expected_weights": weights,
        "total_calls": calls,
        "routed_calls": sum(counts.values()),
        "agent_counts": dict(counts),
        "first_caller": first_caller,
        "first_agent": first_agent,
        "repeated_agent_counts": dict(repeated_counts),
        "errors": errors[:10],
        "result_error_count": len(errors),
    }
    return report, results


def distribution_ok(report, weights):
    if report["routed_calls"] < 20:
        return False, "too few routed calls"
    total = report["routed_calls"]
    actual = [report["agent_counts"].get(idx, 0) for idx, _ in enumerate(weights, start=1)]
    tol = 0.25 * total / sum(weights)
    for idx, weight in enumerate(weights, start=1):
        expected = total * weight / sum(weights)
        got = actual[idx - 1]
        if abs(got - expected) > max(tol, 1):
            return False, f"agent {idx}: expected {expected:.1f}, got {got}"
    return True, "within tolerance"


def repeated_same_test(base, did):
    caller = "03123456789"
    agent_ids = []
    for idx in range(20):
        result = call_route(base, did, caller)
        if result.get("status") != "routed":
            return {
                "passed": False,
                "reason": f"call {idx+1} status={result.get('status')}",
                "results": agent_ids,
            }
        agent_ids.append(result.get("agent_id"))
        time.sleep(0.02)
    passed = len(set(agent_ids)) == 1
    return {"passed": passed, "reason": "same agent" if passed else "different agents", "results": agent_ids}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8002")
    parser.add_argument("--did", default="6312460800")
    parser.add_argument("--calls", type=int, default=100)
    parser.add_argument("--test", type=int, default=None)
    parser.add_argument("--skip-sticky", action="store_true")
    args = parser.parse_args()

    chosen = []
    if args.test is not None:
        for t in TESTS:
            if t["name"].startswith(f"Test {args.test} "):
                chosen = [t]
                break
        if not chosen:
            print(f"No built-in test {args.test}; run without --test to use explicit --did/--calls/--weights.")
            sys.exit(2)
    else:
        chosen = list(TESTS)

    if args.skip_sticky:
        print("WARNING: caller-agent sticky would affect results. Run against a backend where sticky is bypassed or cleared if testing weighted distribution.")
    for t in chosen:
        print(f"RUN\t{t['name']}")
        report, results = run_test(args.base, t["did"], t["calls"], t["weights"])
        ok, msg = distribution_ok(report, t["weights"])
        report["distribution_ok"] = ok
        report["distribution_reason"] = msg
        print(json.dumps(report, indent=2))
        sticky_repeat = repeated_same_test(args.base, t["did"])
        print("STICKY_REPEAT\t{" + f"'passed': {sticky_repeat['passed']}, 'reason': '{sticky_repeat['reason']}', 'results': {sticky_repeat['results'][:8]}... " + "}")
        print()


if __name__ == "__main__":
    main()
