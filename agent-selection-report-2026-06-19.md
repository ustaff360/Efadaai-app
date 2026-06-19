# Agent Selection Weight Validation Report

**Date:** 2026-06-19  
**Endpoint:** `POST /api/v1/get-agent`  
**Calls per DID:** 100  
**Total calls:** 600  
**Caller IDs:** Unique per request (`u000001`–`u000600`)  
**Source:** `agent_selection_audit` (read-only)

---

## Results per DID

### 6312460001 — Support
- Total calls: 100
- Unique callers: 100
- Ali (1003): 50 calls — 50% (configured 50%) ✓
- Anna (1004): 30 calls — 30% (configured 30%) ✓
- Sara (1005): 20 calls — 20% (configured 20%) ✓

### 6312460002 — Logistics
- Total calls: 100
- Unique callers: 100
- Anthony (1006): 25 calls — 25% (configured 25%) ✓
- Agent 7 (1007): 25 calls — 25% (configured 25%) ✓
- Agent8 (1008): 25 calls — 25% (configured 25%) ✓
- Agent9 (1009): 25 calls — 25% (configured 25%) ✓

### 6312460003 — Promotions
- Total calls: 100
- Unique callers: 100
- Agent10 (1010): 40 calls — 40% (configured 40%) ✓
- Agent 11 (1011): 40 calls — 40% (configured 40%) ✓
- Agent12 (1012): 20 calls — 20% (configured 20%) ✓

### 6312460004 — Sales
- Total calls: 100
- Unique callers: 100
- Agent13 (1013): 50 calls — 50% (configured 50%) ✓
- Agent14 (1014): 50 calls — 50% (configured 50%) ✓

### 6312460005 — Billing
- Total calls: 100
- Unique callers: 100
- Agent15 (1015): 70 calls — 70% (configured 70%) ✓
- Agent16 (1016): 15 calls — 15% (configured 15%) ✓
- Agent17 (1017): 15 calls — 15% (configured 15%) ✓

### 6312460006 — Moving
- Total calls: 100
- Unique callers: 100
- Agent18 (1018): 100 calls — 100% (configured 100%) ✓

---

## Summary
- All 600 calls routed successfully
- All caller IDs unique
- All observed agent distributions match configured weights exactly
- No anomalies or unexplained distortion detected
