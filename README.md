# Smart Agent Routing Platform (SARP)

SARP is an intelligent inbound call routing platform for Asterisk PBX. It ingests metadata from an incoming call, selects the right agent by category, assignment weights, availability, and caller affinity, and returns a JSON response so Asterisk can route the call immediately.

## Backend infrastructure

- FastAPI async application (`backend/app/main.py`, `backend/app/api/*`)
- PostgreSQL for durable state: users, agents, categories, assignments, call history, audit logs
- Redis for agent status, sticky caller memory, and round-robin counters
- AMI watcher container integration for Asterisk event polling (`ami-watcher/`)
- Nginx reverse proxy for frontend ingress and API forwarding
- WebSocket signaling for dashboard live refresh

### Runtime behavior

Primary hot path:
- `POST /api/v1/get-agent/`
- `POST /api/v1/route/`
- `POST /api/v1/call-completed/`

The engine:
1) checks blocklist
2) maps DID to category
3) loads active category-agent assignments
4) prefers idle agents from Redis
5) applies sticky caller behavior when possible
6) falls back to weighted, round-robin, or sequential routing
7) logs the call, updates caller stats, stores sticky mapping, and returns the selected agent

## Example API usage

Auth uses JWT bearer tokens. Obtain a token from:

```
POST /api/v1/auth/login/
Body: {"username": "...", "password": "..."}
```

Use the returned token as:

```
Authorization: Bearer <access_token>
```

### Select an agent

```
POST /api/v1/get-agent/
Headers: Content-Type: application/json
Body: {
  "caller_id": "123456789",
  "caller_name": "ABC Company",
  "did": "6312460606"
}
```

Success response:

```json
{
  "success": true,
  "category": "Laundry",
  "agent_name": "Mawra",
  "extension": "1001",
  "error": null
}
```

Blocked caller response:

```json
{
  "success": false,
  "category": null,
  "agent_name": null,
  "extension": null,
  "error": "Blocked"
}
```

Missing DID/category returns HTTP 404 with `detail` explaining the missing mapping.

## Installation

### Docker Compose

```
cp .env.example .env
docker compose up -d --build
```

Services:
- Frontend/Nginx ingress: http://localhost:83
- Backend API: http://localhost:8002
- PostgreSQL: localhost:5435
- Redis: localhost:6382

### Local backend development

```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## API overview

Base URL: `/api/v1`

Routing:
- `POST /api/v1/route/`
- `POST /api/v1/get-agent/`
- `POST /api/v1/call-completed/`

Auth:
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/register/`
- `GET /api/v1/auth/me/`

Agents:
- `GET /api/v1/agents/`
- `POST /api/v1/agents/`
- `GET /api/v1/agents/{id}/`
- `PUT /api/v1/agents/{id}/`
- `DELETE /api/v1/agents/{id}/`
- `POST /api/v1/agents/{id}/activate/`
- `POST /api/v1/agents/{id}/deactivate/`
- `GET /api/v1/agents/{id}/stats/`

Categories:
- `GET /api/v1/categories/`
- `POST /api/v1/categories/`
- `GET /api/v1/categories/{id}/`
- `PUT /api/v1/categories/{id}/`
- `DELETE /api/v1/categories/{id}/`
- `POST /api/v1/categories/{id}/activate/`
- `POST /api/v1/categories/{id}/deactivate/`
- `GET /api/v1/categories/all-dids/`
- `GET /api/v1/categories/{id}/agents/`
- `POST /api/v1/categories/{id}/agents/`
- `PUT /api/v1/categories/{id}/agents/{assignment_id}/`
- `DELETE /api/v1/categories/{id}/agents/{assignment_id}/`

Callers:
- `GET /api/v1/callers/`
- `GET /api/v1/callers/{caller_number}/history/`
- `POST /api/v1/callers/{caller_number}/block/`
- `POST /api/v1/callers/{caller_number}/unblock/`
- `GET /api/v1/callers/blocklist/all/`
- `POST /api/v1/callers/blocklist/`
- `PUT /api/v1/callers/blocklist/{block_id}/`
- `DELETE /api/v1/callers/blocklist/{block_id}/`

Calls:
- `POST /api/v1/calls/start/`
- `POST /api/v1/calls/terminate/`
- `GET /api/v1/calls/active/`

Reports:
- `GET /api/v1/reports/summary/`
- `GET /api/v1/reports/agents/`
- `GET /api/v1/reports/agents/summary/`
- `GET /api/v1/reports/categories/`
- `GET /api/v1/reports/categories/{category_id}/`
- `GET /api/v1/reports/dids/`

Other:
- `GET /api/v1/health/`
- `GET /api/v1/search/`
- `GET /api/v1/audit/`
- `GET /api/v1/config/smtp/`
- `POST /api/v1/config/smtp/`
- `GET /api/v1/recordings/`
