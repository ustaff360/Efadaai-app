# Efada.Ai — Smart Agent Routing & Call Distribution

Enterprise-grade Asterisk PBX call routing engine with intelligent agent selection, weighted distribution, sticky routing, and real-time analytics.

---

## 🔐 API Authentication

The system uses **two authentication layers**:

### 1. JWT Auth (Frontend / Admin UI)

Used by the web dashboard. Users log in with username/password and receive a JWT token.

```
Authorization: Bearer <jwt-token>
```

### 2. API Key Auth (External / Integrations)

Used by external scripts, services, or third-party integrations. The API key is sent as a custom header. Requires no login.

```
X-API-Key: <your-api-key>
```

**How to get your API key:**
- **CLI:** `python scripts/manage_api_key.py generate`
- **Settings UI:** Login → Settings → API Keys → Generate New Key

---

## 📡 API Usage Examples

All examples below require either a valid API key (via `X-API-Key` header) or a JWT Bearer token.

### Base URL

```
https://your-domain.com/api/v1
```

### Agents

**List all agents**
```bash
curl -H "X-API-Key: your-api-key-here" \
  https://your-domain.com/api/v1/agents/
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Ali",
    "extension": "1003",
    "email": "ali@example.com",
    "status": "active",
    "category_assignments": [
      {"id": 1, "name": "Support", "weight": 50}
    ]
  }
]
```

**Get agent stats**
```bash
curl -H "X-API-Key: your-api-key-here" \
  https://your-domain.com/api/v1/reports/agents/summary/?preset=last_30_days
```

**Response:**
```json
[
  {
    "agent_id": 1,
    "agent_name": "Ali",
    "extension": "1003",
    "total_calls": 64,
    "unique_callers": 58,
    "repeat_calls": 6,
    "today_calls": 3
  }
]
```

### Callers

```bash
curl -H "X-API-Key: your-api-key-here" \
  "https://your-domain.com/api/v1/callers/?page=1&limit=10"
```

### Reports

**Export CSV**
```bash
curl -H "X-API-Key: your-api-key-here" \
  "https://your-domain.com/api/v1/reports/export/?preset=last_30_days&format=csv" \
  -o report.csv
```

**Export PDF (with summary stats header)**
```bash
curl -H "X-API-Key: your-api-key-here" \
  "https://your-domain.com/api/v1/reports/export/?preset=last_30_days&agent_id=1&format=pdf" \
  -o ali_report.pdf
```

### Filter by Agent + Date Range

```bash
curl -H "X-API-Key: your-api-key-here" \
  "https://your-domain.com/api/v1/reports/summary/?preset=last_30_days&agent_id=1"
```

### Route a Call

```bash
curl -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"caller_number": "1234567890", "dialed_number": "6312460001"}' \
  https://your-domain.com/api/v1/get-agent
```

### Health Check (no auth required)

```bash
curl https://your-domain.com/health
```

---

## 🔧 CLI Tool

```bash
# Show current key (masked)
python3 scripts/manage_api_key.py show

# Show full key
python3 scripts/manage_api_key.py show --raw

# Generate new key
python3 scripts/manage_api_key.py generate

# Set a custom key
python3 scripts/manage_api_key.py set "my-custom-key-here"
```

---

## 🚀 Quick Start

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

The app will be available at:
- **HTTP:** `http://your-server:83` (redirects to HTTPS)
- **HTTPS:** `https://your-server:443`

---

## 📋 API Security Overview

| Endpoint Group | Auth Required | Method |
|---------------|--------------|--------|
| Auth (`/auth/*`) | None (public) | Login, register, forgot-password |
| Health (`/health`) | None | Health check |
| Users, Agents, Categories, Config | JWT (user session) | Admin UI operations |
| **Callers, Reports, Calls, Route, Recordings, Backup** | **API Key or JWT** | **External integrations** |
| WebSocket (`/ws/*`) | None | Live dashboard updates |
