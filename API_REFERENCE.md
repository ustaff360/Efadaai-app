# Efada Smart Agent Routing — API Reference

Base URL: `http://your-server/api/v1`

Interactive docs: `http://your-server/api/v1/docs`

---

## Authentication

All endpoints (except login/register/health) require a JWT token in the header:

```
Authorization: Bearer <token>
```

### POST /auth/login/

Login and get a JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@efada.ai",
    "full_name": "Administrator",
    "role": "admin",
    "status": "active",
    "last_login": "2026-04-18T05:00:00",
    "created_at": "2026-04-18T04:00:00"
  }
}
```

### POST /auth/register/

Register a new user (first user becomes admin automatically).

**Request:**
```json
{
  "username": "john",
  "email": "john@company.com",
  "password": "secret123",
  "full_name": "John Smith",
  "role": "viewer"
}
```

**Roles:** `admin`, `manager`, `agent`, `viewer`

### GET /auth/me/

Get current user profile. Requires auth.

### POST /auth/change-password/

Change own password. Requires auth.

**Request:**
```json
{
  "current_password": "old123",
  "new_password": "new456"
}
```

---

## ⭐ Routing (Asterisk Integration)

This is the **main endpoint Asterisk calls** to route inbound calls.

### POST /route/

Route an inbound call to the best available agent.

**No authentication required** (designed for Asterisk CURL/curlfunc).

**Request:**
```json
{
  "caller_number": "+15559876543",
  "dialed_number": "+15551234567",
  "caller_name": "Optional Name"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `caller_number` | string | Yes | The inbound caller's phone number |
| `dialed_number` | string | Yes | The DID number that was dialed (matches a DID in the system) |
| `caller_name` | string | No | Caller name if available |

**Response — Routed (200):**
```json
{
  "status": "routed",
  "agent_extension": "1001",
  "agent_name": "John Smith",
  "agent_id": 5,
  "category": "Sales Line",
  "category_id": 2,
  "repeat": true,
  "strategy": "weighted"
}
```

| Field | Description |
|---|---|
| `status` | `"routed"` = agent found, `"blocked"` = caller is blocked |
| `agent_extension` | **Extension to dial** — Asterisk uses this to transfer the call |
| `agent_name` | Agent's display name |
| `agent_id` | Internal agent ID |
| `category` | Category name the DID belongs to |
| `category_id` | Internal category ID |
| `repeat` | `true` if this caller was previously routed to this agent (sticky) |
| `strategy` | Routing strategy used: `weighted`, `round_robin`, `sequential` |

**Response — Blocked (404):**
```json
{
  "status": "blocked",
  "caller_number": "+15559876543",
  "destination": "voicemail",
  "destination_value": "5000",
  "reason": "Spam caller"
}
```

| Field | Description |
|---|---|
| `destination` | Where to send blocked calls: `voicemail`, `announcement`, `extension` |
| `destination_value` | Extension/number for the destination |

**Response — Error (404):**
```json
{
  "detail": "No category found for DID: +15550000000"
}
```

---

### Asterisk Dialplan Integration

#### Option 1: Using CURL() function (Asterisk 12+)

```ini
; /etc/asterisk/extensions_custom.conf

[from-trunk-custom]
; For inbound calls coming from trunks
exten => _+1XXXXXXXXXX,1,NoOp(Inbound call from ${CALLERID(num)} to ${EXTEN})
    same => n,Set(RAW_JSON=${CURL(http://127.0.0.1/api/v1/route/,{"caller_number":"${CALLERID(num)}","dialed_number":"${EXTEN}"})})
    same => n,Set(ROUTED_EXT=${CUT(RAW_JSON,",2):13:-1})
    same => n,Set(ROUTED_STATUS=${CUT(RAW_JSON,",1):10:-1})
    same => n,GotoIf($["${ROUTED_STATUS}" = "blocked"]?blocked)
    same => n,GotoIf($["${ROUTED_STATUS}" = "routed"]?routed)
    same => n,Goto(failed)

    same => n(routed),NoOp(Routed to extension ${ROUTED_EXT})
    same => n,Dial(PJSIP/${ROUTED_EXT},30)
    same => n,Goto(voicemail)

    same => n(blocked),NoOp(Caller blocked)
    same => n,Goto(voicemail)

    same => n(voicemail),Voicemail(${ROUTED_EXT}@default,u)
    same => n,Hangup()

    same => n(failed),NoOp(Routing failed: ${RAW_JSON})
    same => n,Goto(voicemail)
```

#### Option 2: Using cURL from Shell (older Asterisk)

```ini
[from-trunk-custom]
exten => _+1XXXXXXXXXX,1,NoOp(Routing via API)
    same => n,Set(ROUTED_JSON=${SHELL(curl -s -X POST http://ROUTING_SERVER/api/v1/route/ -H "Content-Type: application/json" -d '{"caller_number":"${CALLERID(num)}","dialed_number":"${EXTEN}"}')})
    same => n,Set(AGENT_EXT=${JSON_DECODE(${ROUTED_JSON},agent_extension)})
    same => n,Set(ROUTE_STATUS=${JSON_DECODE(${ROUTED_JSON},status)})
    same => n,GotoIf($["${ROUTE_STATUS}" = "routed"]?dial:voicemail)
    same => n(dial),Dial(PJSIP/${AGENT_EXT},30)
    same => n(voicemail),Voicemail(${AGENT_EXT}@default,u)
    same => n,Hangup()
```

#### Option 3: Using AGI Script (Python)

```python
#!/usr/bin/env python3
# /var/lib/asterisk/agi-bin/route_call.py

import json
import requests
import sys

from asterisk.agi import AGI

agi = AGI()
agi.answer()

caller = agi.env['agi_callerid']
dialed = agi.env['agi_extension']

response = requests.post(
    'http://ROUTING_SERVER/api/v1/route/',
    json={'caller_number': caller, 'dialed_number': dialed},
    timeout=5
)

data = response.json()

if data.get('status') == 'routed':
    agi.set_variable('ROUTED_EXT', data['agent_extension'])
    agi.set_variable('ROUTED_AGENT', data['agent_name'])
    agi.set_variable('IS_REPEAT', '1' if data.get('repeat') else '0')
    agi.set_variable('ROUTE_STATUS', 'routed')
elif data.get('status') == 'blocked':
    agi.set_variable('ROUTE_STATUS', 'blocked')
    agi.set_variable('BLOCK_DEST', data.get('destination', 'voicemail'))
    agi.set_variable('BLOCK_VALUE', data.get('destination_value', ''))
else:
    agi.set_variable('ROUTE_STATUS', 'failed')
```

In extensions.conf:
```ini
[from-trunk]
exten => _+1XXXXXXXXXX,1,NoOp(AGI Routing)
    same => n,AGI(route_call.py)
    same => n,GotoIf($["${ROUTE_STATUS}" = "routed"]?dial)
    same => n,GotoIf($["${ROUTE_STATUS}" = "blocked"]?blocked)
    same => n,Goto(voicemail)
    same => n(dial),Dial(PJSIP/${ROUTED_EXT},30)
    same => n(voicemail),Voicemail(${ROUTED_EXT}@default,u)
    same => n,Hangup()
    same => n(blocked),Playback(silence/1)
    same => n,Hangup()
```

#### Option 4: VitalPBX Custom Destination

In VitalPBX Admin:
1. Go to **PBX** → **Call Routing** → **Custom Destination**
2. Create destination: `from-trunk-custom,s,1`
3. Assign to your inbound route

#### Option 5: FreePBX Custom Destination

1. Install **Custom Destinations** module
2. Add: `from-trunk-custom,s,1`
3. Create **Inbound Route** pointing to this custom destination

---

## Health

### GET /health

Health check (no auth required).

**Response (200):**
```json
{
  "status": "healthy",
  "service": "Smart Agent Routing API",
  "version": "1.0.0"
}
```

---

## Agents

### GET /agents/

List all agents.

**Query params:** `status`, `search`, `page`, `limit`

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "John Smith",
    "extension": "1001",
    "email": "john@company.com",
    "default_weight": 100,
    "status": "active",
    "categories": [{"id": 2, "name": "Sales Line"}]
  }
]
```

### POST /agents/

Create a new agent.

**Request:**
```json
{
  "name": "Jane Doe",
  "extension": "1002",
  "email": "jane@company.com",
  "default_weight": 50
}
```

### GET /agents/{agent_id}/

Get agent details with categories.

### PUT /agents/{agent_id}/

Update an agent.

**Request:**
```json
{
  "name": "Jane Smith",
  "default_weight": 75,
  "status": "inactive"
}
```

### DELETE /agents/{agent_id}/

Delete agent and all related records. Returns 204.

### POST /agents/{agent_id}/activate/

Activate an agent.

### POST /agents/{agent_id}/deactivate/

Deactivate an agent.

### GET /agents/{agent_id}/stats/

Get agent performance statistics.

**Response:**
```json
{
  "agent_id": 1,
  "agent_name": "John Smith",
  "total_calls": 150,
  "repeat_calls": 45,
  "avg_duration": 127.5
}
```

---

## Categories

### GET /categories/

List all categories.

**Query params:** `status`, `search`, `page`, `limit`

### POST /categories/

Create a new category.

**Request:**
```json
{
  "name": "Sales Line",
  "description": "Main sales inquiries",
  "customer_name": "Acme Corp",
  "contact_number": "+15551234567",
  "owner_email": "sales@acme.com",
  "locations": ["NYC", "LA"]
}
```

### GET /categories/{category_id}/

Get category details.

### PUT /categories/{category_id}/

Update category.

### DELETE /categories/{category_id}/

Delete category and all related records. Returns 204.

### POST /categories/{category_id}/activate/

Activate category.

### POST /categories/{category_id}/deactivate/

Deactivate category.

---

### DID Management (under Categories)

### GET /categories/{category_id}/dids/

List DIDs for a category.

**Response:**
```json
[
  {
    "id": 1,
    "did_number": "+15551234567",
    "description": "Main Sales Line",
    "category_id": 2
  }
]
```

### POST /categories/{category_id}/dids/

Add a DID to a category.

**Request:**
```json
{
  "did_number": "+15551234568",
  "description": "Backup Sales Line"
}
```

### PUT /categories/{category_id}/dids/{did_id}/

Update a DID.

### DELETE /categories/{category_id}/dids/{did_id}/

Remove a DID. Returns 204.

---

### Agent Assignment (under Categories)

### GET /categories/{category_id}/agents/

List agents assigned to a category.

**Response:**
```json
[
  {
    "id": 1,
    "agent_id": 5,
    "agent_name": "John Smith",
    "agent_extension": "1001",
    "override_weight": 80,
    "routing_strategy": "weighted",
    "active": true
  }
]
```

### POST /categories/{category_id}/agents/

Assign an agent to a category.

**Request:**
```json
{
  "agent_id": 5,
  "override_weight": 80,
  "routing_strategy": "round_robin"
}
```

**Strategies:** `weighted`, `round_robin`, `sequential`

### PUT /categories/{category_id}/agents/{assignment_id}/

Update agent assignment.

**Request:**
```json
{
  "override_weight": 60,
  "active": false
}
```

### DELETE /categories/{category_id}/agents/{assignment_id}/

Remove agent from category. Returns 204.

---

## Callers

### GET /callers/

List all tracked callers.

**Query params:** `search`, `blocked` (bool), `page`, `limit`

**Response:**
```json
[
  {
    "id": 1,
    "caller_number": "+15559876543",
    "caller_name": null,
    "total_calls": 5,
    "is_blocked": false,
    "block_reason": null,
    "last_call_at": "2026-04-18T05:30:00",
    "last_category": "Sales Line",
    "last_agent_name": "John Smith",
    "last_agent_extension": "1001",
    "last_did": "+15551234567"
  }
]
```

### GET /callers/{caller_number}/history/

Get call history for a specific caller.

**Response:**
```json
[
  {
    "id": 42,
    "caller_number": "+15559876543",
    "agent_name": "John Smith",
    "agent_extension": "1001",
    "category_name": "Sales Line",
    "did_number": "+15551234567",
    "call_start": "2026-04-18T05:30:00",
    "call_end": "2026-04-18T05:32:15",
    "duration_sec": 135,
    "is_repeat": true,
    "is_blocked": false,
    "recording_path": null
  }
]
```

### DELETE /callers/{caller_id}/

Delete a caller and their history.

### POST /callers/bulk-delete/

Bulk delete callers.

**Request:**
```json
{
  "ids": [1, 2, 3]
}
```

### POST /callers/{caller_number}/block/

Block a caller.

**Request:**
```json
{
  "phone_number": "+15559876543",
  "reason": "Spam caller",
  "destination": "voicemail",
  "destination_value": "5000"
}
```

**Destinations:** `voicemail`, `announcement`, `extension`

### POST /callers/{caller_number}/unblock/

Unblock a caller.

---

### Blocklist Management

### GET /callers/blocklist/all/

List all blocked numbers.

**Query params:** `search`, `active_only` (default: true)

### POST /callers/blocklist/

Add a number to blocklist.

**Request:**
```json
{
  "phone_number": "+15550001111",
  "reason": "Telemarketer",
  "destination": "voicemail",
  "destination_value": "5000"
}
```

### PUT /callers/blocklist/{block_id}/

Update blocklist entry.

### DELETE /callers/blocklist/{block_id}/

Remove from blocklist. Returns 204.

---

## Users (Admin Only)

### GET /users/

List all users.

**Query params:** `search`, `role`, `status`, `page`, `limit`

### POST /users/

Create a new user.

**Request:**
```json
{
  "username": "agent1",
  "email": "agent1@company.com",
  "password": "secret123",
  "full_name": "Agent One",
  "role": "agent"
}
```

### GET /users/{user_id}/

Get user by ID.

### PUT /users/{user_id}/

Update user.

### DELETE /users/{user_id}/

Delete user. Returns 204.

### POST /users/{user_id}/reset-password/

Reset user password to `changeme123`.

---

## Reports

### GET /reports/summary/

Dashboard summary statistics.

**Query params:** `preset` (default: `last_30_days`)

**Presets:** `today`, `yesterday`, `last_7_days`, `last_30_days`, `last_90_days`

**Response:**
```json
{
  "total_calls": 1250,
  "total_callers": 890,
  "repeat_callers": 245,
  "repeat_rate": 27.53,
  "blocked_calls": 15,
  "total_agents": 8,
  "total_categories": 5,
  "total_dids": 12,
  "avg_call_duration": 142.5
}
```

### GET /reports/agents/

Per-agent statistics.

### GET /reports/categories/

Per-category statistics.

### GET /reports/dids/

Per-DID statistics.

### GET /reports/call-history/

Filterable call history.

**Query params:** `preset`, `agent_id`, `category_id`, `did_id`, `search`, `page`, `limit`

### GET /reports/export/?format=csv&preset=last_30_days

Export report as CSV or PDF.

**Params:** `format` (csv or pdf), `preset`

---

## Search

### GET /search/?q=term

Global search across agents, callers, DIDs, and categories.

**Query params:** `q` (required), `limit`

**Response:**
```json
[
  {
    "type": "agent",
    "id": 1,
    "title": "John Smith",
    "subtitle": "Ext: 1001 • john@company.com",
    "url": "/agents"
  },
  {
    "type": "did",
    "id": 5,
    "title": "+15551234567",
    "subtitle": "Sales Line",
    "url": "/categories"
  }
]
```

**Types:** `agent`, `caller`, `did`, `category`

---

## Backup

### GET /backup/export/

Export full database as JSON file. Requires admin.

### POST /backup/import/

Restore from JSON backup file. Requires admin.

**Request:** `multipart/form-data` with `file` field.

---

## Routing Strategies

| Strategy | Description |
|---|---|
| `weighted` | Random selection weighted by agent weight. Agent with weight 100 gets ~2x calls as agent with weight 50. |
| `round_robin` | Cycles through agents evenly. Uses Redis counter per category. |
| `sequential` | Always picks the agent with the lowest ID (first available). |

## Sticky Agent (Repeat Caller)

When a caller calls back within `STICKY_WINDOW_DAYS` (default: 30 days), the system routes them to the **same agent** they spoke with last time. The `repeat` flag in the response tells Asterisk this is a repeat call.

Redis key: `sticky:{caller_number}:{category_id}` → agent_id

## Agent Status (Redis)

The AMI Watcher updates agent status in Redis:

| Key | TTL | Values |
|---|---|---|
| `agent_status:{extension}` | 60s | `idle`, `busy`, `unavailable` |

The routing engine filters out `busy` agents and only routes to `idle` ones.

---

## Error Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 204 | Deleted (no content) |
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Forbidden (insufficient role) |
| 404 | Not found (or routing error — no category/agents) |
| 409 | Conflict (duplicate) |
| 500 | Server error |
