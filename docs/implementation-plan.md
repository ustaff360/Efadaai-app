# Asterisk Smart Agent Routing & Call Distribution System
## Implementation Plan

> **Project Duration:** 10 Weeks (3 Phases)
> **Tech Stack:** Python + FastAPI | PostgreSQL | Redis | React | Docker Compose
> **Last Updated:** 2026-04-17

---

## Executive Summary

This project delivers an enterprise-grade agent selection and call routing engine for Asterisk PBX. When an inbound call arrives, Asterisk sends an HTTP request to our application. The app applies:

- **Sticky agent logic** — repeat callers route to the same agent (if available)
- **Weight-based distribution** — first-time callers distributed by configurable weights
- **Real-time agent presence** — via AMI, tracks agent idle/busy/unavailable status

The system includes a full management dashboard with reporting, category management, multi-user roles, SMTP alerts, and live Asterisk server monitoring.

---

## Architecture Overview

```
┌─────────────┐     POST /v1/route      ┌──────────────────┐
│   Asterisk   │ ──────────────────────► │   FastAPI Router  │
│   PBX        │ ◄────────────────────── │   (Port 8000)     │
└─────────────┘   {agent_extension}      └────────┬─────────┘
                                                   │
         ┌─────────────────────────────────────────┤
         │                                         │
         ▼                                         ▼
┌──────────────────┐                    ┌──────────────────┐
│     Redis         │                    │   PostgreSQL      │
│  (Agent Status,   │                    │  (Agents, Cats,   │
│   Sticky Cache)   │                    │   Call Logs)      │
└────────▲──────────┘                    └──────────────────┘
         │
         │ AMI Events
         ▼
┌──────────────────┐          ┌──────────────────┐
│  AMI Watcher      │          │  React Dashboard  │
│  (Singleton)      │          │  (Port 3000)      │
└──────────────────┘          └──────────────────┘
```

---

## Phase 1: Core System (Weeks 1-5)
*Category/Agent Management, Routing Engine, Reporting Dashboard*

### 1.1 Project Setup & Infrastructure
| Task | Description | Files |
|------|-------------|-------|
| 1.1.1 | Docker Compose with PostgreSQL, Redis, Backend, Frontend | `docker-compose.yml`, `.env` |
| 1.1.2 | FastAPI project skeleton with config | `backend/app/main.py`, `core/config.py` |
| 1.1.3 | Database connection + session management | `core/database.py` |
| 1.1.4 | Redis connection helper | `core/redis.py` |
| 1.1.5 | Single-file deployment script | `setup.sh` |

### 1.2 Database Schema
| Table | Fields | Purpose |
|-------|--------|---------|
| `agents` | id, name, extension, email, default_weight, status, created_at, updated_at | Global agent pool |
| `categories` | id, name, description, owner_email, locations (JSON), created_at | Business/category definitions |
| `dids` | id, did_number, category_id, description | DID to category mapping |
| `category_agents` | id, category_id, agent_id, override_weight, active | Agent-category assignment |
| `callers` | id, caller_number, total_calls, last_call_at, created_at | Caller tracking |
| `call_logs` | id, caller_number, agent_id, category_id, call_start, call_end, duration_sec, is_repeat, recording_path | Full call history |
| `users` | id, username, email, password_hash, role, active, created_at | System users |
| `audit_logs` | id, user_id, action, entity_type, entity_id, old_value, new_value, created_at | Change tracking |

### 1.3 Agent Management API
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/agents` | GET | List all agents (paginated, filterable) |
| `/api/v1/agents` | POST | Create new agent |
| `/api/v1/agents/{id}` | GET | Get agent details |
| `/api/v1/agents/{id}` | PUT | Update agent |
| `/api/v1/agents/{id}` | DELETE | Soft-delete agent |
| `/api/v1/agents/{id}/history` | GET | Agent's call history |
| `/api/v1/agents/{id}/stats` | GET | Agent's performance stats |

### 1.4 Category/Business Management API
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/categories` | GET | List all categories |
| `/api/v1/categories` | POST | Create category |
| `/api/v1/categories/{id}` | GET | Get category with agents |
| `/api/v1/categories/{id}` | PUT | Update category |
| `/api/v1/categories/{id}` | DELETE | Soft-delete category |
| `/api/v1/categories/{id}/agents` | GET | List agents in category |
| `/api/v1/categories/{id}/agents` | POST | Assign agent to category |
| `/api/v1/categories/{id}/dids` | GET | List DIDs for category |
| `/api/v1/categories/{id}/dids` | POST | Add DID to category |

### 1.5 Routing Engine
| Task | Description | Logic |
|------|-------------|-------|
| 1.5.1 | `POST /api/v1/route` endpoint | Accepts caller_number, dialed_number |
| 1.5.2 | DID → Category lookup | Query DIDs table |
| 1.5.3 | Sticky agent check | Query call_logs for caller + category, within sticky window |
| 1.5.4 | Agent availability check | Read Redis `agent_status:{ext}` — skip busy/unavailable |
| 1.5.5 | Weighted selection | Weighted random among idle agents in category |
| 1.5.6 | Call log write | Record selection with timestamp |
| 1.5.7 | Response | Return agent_extension, agent_name, category, is_repeat |

**Routing Logic Flow:**
```
1. Receive: {caller_number, dialed_number}
2. Lookup: dialed_number → category_id (from DIDs table)
3. Check: is caller_number in call_logs for this category within sticky_window?
   YES → Try same agent_id (if idle in Redis)
         If busy → fall through to weighted selection
   NO  → weighted selection
4. Weighted selection:
   - Get category_agents WHERE category_id = X AND active = true
   - Filter: only agents with Redis status = "idle"
   - Weighted random selection (weights from override_weight or default_weight)
5. Write: call_log entry with selected agent, is_repeat flag
6. Return: {agent_extension, agent_name, category, repeat: true/false}
```

### 1.6 Reporting Dashboard API
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/reports/summary` | GET | Total calls, unique callers, repeat rate |
| `/api/v1/reports/agents` | GET | Per-agent stats (calls handled, avg duration) |
| `/api/v1/reports/categories` | GET | Per-category call distribution |
| `/api/v1/reports/repeat-callers` | GET | List of repeat callers |
| `/api/v1/reports/call-history` | GET | Filterable call log (date range, agent, category) |
| `/api/v1/reports/export` | GET | Export report as PDF or CSV |

### 1.7 Frontend (Phase 1)
| Page | Features |
|------|----------|
| Dashboard | Summary cards (total calls, agents, categories), charts |
| Agents | Table with CRUD, assign to categories, view stats |
| Categories | Table with CRUD, manage DIDs, assign agents |
| Call History | Filterable table, caller details, repeat flag |
| Reports | Date range picker, chart view, PDF/CSV export |

---

## Phase 2: Asterisk Integration (Weeks 6-8)
*AMI Connection, Real-time Status, Call Recordings*

### 2.1 Asterisk Server Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/asterisk/servers` | GET | List configured Asterisk servers |
| `/api/v1/asterisk/servers` | POST | Add server (name, IP, AMI port, credentials) |
| `/api/v1/asterisk/servers/{id}` | PUT | Update server config |
| `/api/v1/asterisk/servers/{id}` | DELETE | Remove server |
| `/api/v1/asterisk/servers/{id}/discover` | GET | Discover SIP/PJSIP peers via AMI |
| `/api/v1/asterisk/servers/{id}/status` | GET | Server connection status |

### 2.2 AMI Watcher Service (ami-watcher/)
| Task | Description |
|------|-------------|
| 2.2.1 | Persistent AMI connections to all configured servers |
| 2.2.2 | Subscribe to events: Newstate, Hangup, PeerStatus, ExtensionStatus |
| 2.2.3 | Update Redis: `agent_status:{ext}` = idle/busy/unavailable |
| 2.2.4 | TTL-based expiry (auto-unavailable if no events in 60s) |
| 2.2.5 | CDR collection from Hangup events |
| 2.2.6 | Call duration calculation |
| 2.2.7 | Singleton pattern — only one instance runs |

### 2.3 Real-time Status UI
| Feature | Description |
|---------|-------------|
| Agent status indicators | Green (idle), Yellow (busy), Red (unavailable) |
| WebSocket push | Dashboard updates without refresh |
| Manual override | Admin can force agent status |
| Status history | View agent status changes over time |

### 2.4 Call Recordings
| Task | Description |
|------|-------------|
| 2.4.1 | Monitor recording file path from AMI events |
| 2.4.2 | Store recording metadata in call_logs |
| 2.4.3 | Serve recordings via API endpoint |
| 2.4.4 | In-browser audio player in dashboard |
| 2.4.5 | Download recording button |

### 2.5 Frontend (Phase 2)
| Page | Features |
|------|----------|
| Asterisk Servers | CRUD table, connection status, peer discovery |
| Agent Overview | Real-time status grid, filterable by category |
| Call History Enhanced | Recording playback, duration display |

---

## Phase 3: Admin & Operations (Weeks 9-10)
*Auth, Audit, SMTP, Backup/Restore*

### 3.1 User Management & Auth
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/login` | POST | JWT login |
| `/api/v1/auth/refresh` | POST | Refresh token |
| `/api/v1/users` | GET | List users (admin only) |
| `/api/v1/users` | POST | Create user |
| `/api/v1/users/{id}` | PUT | Update user |
| `/api/v1/users/{id}` | DELETE | Deactivate user |

**Roles:** admin, manager, viewer

### 3.2 Audit Logs
| Task | Description |
|------|-------------|
| 3.2.1 | Log all CRUD operations |
| 3.2.2 | Track old vs new values |
| 3.2.3 | Searchable audit log UI |
| 3.2.4 | Filter by user, entity, date range |

### 3.3 SMTP & Alerts
| Feature | Description |
|---------|-------------|
| SMTP configuration | Server, port, credentials in settings |
| Alert triggers | Agent unreachable, high call volume, system errors |
| Email reports | Send report PDF/CSV directly from dashboard |
| Alert recipients | Configurable per alert type |

### 3.4 Backup & Restore
| Feature | Description |
|---------|-------------|
| Full backup | Agents, categories, DIDs, call logs, users, config |
| Export format | SQL dump + JSON config |
| Restore | Upload backup file, verify, restore |
| Scheduled backups | Cron-based automatic backups |

### 3.5 Frontend (Phase 3)
| Page | Features |
|------|----------|
| Login | JWT auth flow |
| Settings | SMTP config, backup/restore, system settings |
| Audit Logs | Searchable, filterable change history |
| User Management | CRUD with role assignment |

---

## Docker Compose Services

```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes: postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: asterisk_routing
      POSTGRES_USER: routing_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes: redis_data:/data

  backend:
    build: ./backend
    ports: "8000:8000"
    depends_on: [postgres, redis]
    environment:
      DATABASE_URL: postgresql://routing_user:${DB_PASSWORD}@postgres/asterisk_routing
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: ${SECRET_KEY}

  ami-watcher:
    build: ./ami-watcher
    depends_on: [postgres, redis]
    environment:
      DATABASE_URL: postgresql://routing_user:${DB_PASSWORD}@postgres/asterisk_routing
      REDIS_URL: redis://redis:6379/0
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports: "3000:3000"
    depends_on: [backend]

  nginx:
    image: nginx:alpine
    ports: "80:80"
    volumes: ./nginx/default.conf:/etc/nginx/conf.d/default.conf
    depends_on: [backend, frontend]
```

---

## File Structure

```
asterisk-routing-system/
├── docker-compose.yml
├── setup.sh
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── api/
│       │   ├── __init__.py
│       │   ├── route.py
│       │   ├── agents.py
│       │   ├── categories.py
│       │   ├── callers.py
│       │   ├── reports.py
│       │   ├── asterisk.py
│       │   ├── auth.py
│       │   └── users.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── agent.py
│       │   ├── category.py
│       │   ├── caller.py
│       │   ├── call_log.py
│       │   ├── did.py
│       │   ├── asterisk_server.py
│       │   ├── user.py
│       │   └── audit_log.py
│       ├── services/
│       │   ├── __init__.py
│       │   ├── router.py
│       │   ├── ami_client.py
│       │   ├── reporter.py
│       │   └── backup.py
│       └── core/
│           ├── __init__.py
│           ├── config.py
│           ├── database.py
│           ├── redis.py
│           ├── security.py
│           └── exceptions.py
├── ami-watcher/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── watcher.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── index.jsx
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Agents.jsx
│       │   ├── Categories.jsx
│       │   ├── CallHistory.jsx
│       │   ├── Reports.jsx
│       │   ├── AsteriskServers.jsx
│       │   └── Settings.jsx
│       └── components/
│           ├── AgentStatusBadge.jsx
│           ├── CallRecordingPlayer.jsx
│           ├── ReportExporter.jsx
│           └── Navbar.jsx
├── nginx/
│   └── default.conf
└── docs/
    ├── implementation-plan.md (this file)
    ├── setup-guide.pdf
    ├── user-guide.pdf
    └── api-reference.pdf
```

---

## Implementation Order (Phase 1)

### Week 1: Foundation
1. Docker Compose + .env setup
2. FastAPI skeleton + health check
3. PostgreSQL models (all tables)
4. Database migrations

### Week 2: Core APIs
5. Agent CRUD API + tests
6. Category CRUD API + tests
7. DID management API
8. Category-Agent assignment API

### Week 3: Routing Engine
9. `POST /api/v1/route` endpoint
10. Sticky agent logic
11. Weighted selection algorithm
12. Redis integration for status (mock for Phase 1)

### Week 4: Reporting
13. Summary stats API
14. Per-agent stats API
15. Call history API with filters
16. PDF export (reportlab/weasyprint)
17. CSV export

### Week 5: Frontend + Polish
18. React project setup
19. Dashboard page
20. Agents page (CRUD)
21. Categories page (CRUD)
22. Call History page
23. Reports page with export
24. Integration testing
25. Setup script + documentation

---

## Verification Steps

After each phase:
1. `docker-compose up -d` — all containers healthy
2. API health check — `GET /api/v1/health` returns 200
3. Run test suite — `pytest` passes
4. Frontend loads — all pages render
5. End-to-end test — create agent, assign to category, route a call

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AMI connection instability | High | Reconnection logic, health checks, alerts |
| Redis memory growth | Medium | TTL on status keys, periodic cleanup |
| Weighted distribution unfairness | Low | Track actual vs expected distribution |
| PDF export performance | Low | Async generation, background jobs |
| Docker resource usage | Low | Resource limits in compose, monitoring |

---

*Plan generated by Hermes Agent — 2026-04-17*
