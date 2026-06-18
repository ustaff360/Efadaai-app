#!/usr/bin/env python3
"""
Generate 100 calls on DID 6312460800 with unique caller IDs.
Reports on distribution.
"""
import json
import urllib.request
import collections

BASE = "http://127.0.0.1:8002"
DID = "6312460800"
TOTAL_CALLS = 100

results = []

for i in range(1, TOTAL_CALLS + 1):
    caller_id = f"03100000{i:03d}"
    payload = json.dumps({"caller_id": caller_id, "did": DID}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/v1/route/",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        results.append({
            "caller_id": caller_id,
            "agent_id": data.get("agent_id"),
            "agent_name": data.get("agent_name"),
            "agent_extension": data.get("agent_extension"),
        })

# Summary
counts = collections.Counter(r["agent_id"] for r in results)
print(f"\nTotal calls: {len(results)}")
print("Distribution:")
for agent_id, count in sorted(counts.items()):
    pct = count / TOTAL_CALLS * 100
    print(f"  Agent {agent_id}: {count} calls ({pct:.1f}%)")

# Save full results
with open("/tmp/did_6312460800_100calls.json", "w") as f:
    json.dump(results, f, indent=2)
print("\nFull results saved to /tmp/did_6312460800_100calls.json")
