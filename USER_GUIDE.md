# User Guide — Smart Agent Routing System

Comprehensive guide for administrators and operators of the call routing and distribution system.

---

## 1. System Overview

The system routes inbound PBX calls to the best available agent using:
- Caller history & sticky routing
- Category-based DID mapping
- Weighted/round-robin/sequential distribution
- Real-time agent availability
- Blocklist filtering

Accessible via web dashboard (HTTPS) or REST API (with API key).

---

## 2. Accessing the App

### Web Dashboard
```
https://your-domain.com
```
Log in with your username/email and password. The first registered account becomes admin.

### REST API
```
https://your-domain.com/api/v1/...
```
Requires `X-API-Key` header for external calls. See section 16.

---

## 3. Dashboard

Shows real-time routing overview:
- **6 KPI cards**: Total Calls, Unique Callers, Repeat Callers, Blocked, Active Agents, Categories
- **Live call popup**: Real-time call routing notifications via WebSocket
- **Calls by Agent chart**: Bar chart of agent call volumes
- **Distribution pie**: Agent/category distribution
- **Agent Performance table**: Calls, extension, repeat rate, today calls, avg duration
- **Category Performance table**: DIDs, calls, agents, repeat rate

---

## 4. Agent Management

Navigate to **Agents**.

**Features:**
- View all agents with stats (calls, unique callers, repeat rate, today calls)
- Search by name or extension
- Create agent: name, extension, email, status
- Edit agent: name, email, status
- Delete agent (removes call logs and assignments)
- **Stats modal**: Scrollable detail with categories table, call history, summary cards

**Assigning agents to categories:**
1. Go to Categories
2. Click Edit on a category
3. Select agents and set weights
4. Total weight must equal 100 for active assignments

---

## 5. Category Management

Navigate to **Categories**.

**Features:**
- View categories with assigned agents count, DIDs, call stats
- Search by name
- Create category with name and description
- Add/remove DIDs under category
- Assign agents with weight
- **Stats modal**: Assigned agents table, call history, summary stats

**Supported routing strategies:**
- `weighted` — distribute calls by weight percentage
- `round_robin` — cycle evenly through agents
- `sequential` — go down the list in order

---

## 6. DID Management

Navigate to **DIDs**.

**Features:**
- View DIDs with assigned category and description
- Create DID under a category
- Edit DID number or description
- Remove DID

DIDs are auto-linked to call logs when calls are routed through the system.

---

## 7. Callers & History

Navigate to **Callers**.

**Features:**
- Search callers by number or name
- Pagination: 25/50/75/100 per page
- View call count, last category, last agent, last call date
- **History modal**: Agent name, category, DID number, timestamp, duration, repeat badge
- Block/unblock callers
- Bulk delete selected callers
- Status badges: New call vs Repeat caller

---

## 8. Reports & Analytics

Navigate to **Reports**.

**Features:**
- **Filter panel**: Time range (Today → Last Year or Custom), Agent, Category, DID filter
- **6 KPI cards**: Total Calls, Unique Callers, Repeat Callers, Blocked, Active Agents, Categories
- **Bar chart**: Calls by Agent/Category/DID with expandable height for DID view
- **Distribution pie chart**: Percentage breakdown with labels
- **Performance tables**: Agent, Category, DID views with sortable columns

**Tabs:**
- By Agent — Agent name, extension, total calls, unique callers, repeat rate, today calls, avg duration
- By Category — Category name, DIDs, total calls, unique callers, repeat rate, agents, today calls
- By DID — DID number, category, total calls, callers, avg per DID

**Export:**
- CSV: Date, Caller, Agent, Extension, DID Number, Category, Duration, Repeat
- PDF: Same data with summary stats header (Total Calls, Unique Callers, Repeat Calls, Repeat Rate, Today Calls)

---

## 9. Settings

Navigate to **Settings**.

### Tabs:
| Tab | Purpose |
|-----|---------|
| **AMI Connection** | Asterisk AMI server host, port, username, password |
| **Routing** | Poll interval, agent status TTL, sticky window days |
| **SMTP Settings** | Mail server for password reset emails |
| **Users** | Create/edit/delete system users, role management |
| **API Keys** | Generate and manage API keys for external integrations |
| **Audit Logs** | System activity log with search and filter |
| **My Profile** | Update name, email, change password |
| **Backup & Restore** | Export/import full system data |

---

## 10. Global Search

Press `Cmd+K` or `Ctrl+K` anywhere to open global search.

Searches across:
- **Agents** — by name or extension
- **Callers** — by number
- **Categories** — by name
- **DIDs** — by number

Use arrow keys to navigate, Enter to select, Escape to close.

---

## 11. Common Workflows

### New deployment bootstrap
1. Log in as first user → becomes admin
2. **Settings → Users** → Create additional users with appropriate roles
3. **Categories** → Create categories (e.g. Support, Sales, Billing)
4. **DIDs** → Create DIDs and assign to categories
5. **Agents** → Create agents with extensions
6. **Categories → Edit** → Assign agents with weights (total = 100)
7. **Verify routing** with test calls via API
8. **Configure blocklist** if needed
9. **Settings → API Keys** → Generate API key for Asterisk integration
10. Point Asterisk trunk to `/api/v1/get-agent`

### Review agent performance
1. Open **Reports**
2. Select time range and agent filter
3. Review KPI cards, bar chart, distribution
4. Click **By Agent** tab for detailed table
5. Export CSV or PDF for offline review

### Handle repeat callers
1. **Dashboard** shows repeat caller count
2. **Reports → By Agent** shows repeat rate per agent
3. **Callers** → View history → "Repeat" badge on sticky-hit calls
4. Adjust sticky window in **Settings → Routing**

---

## 12. API Key Authentication

External scripts and integrations authenticate via `X-API-Key` header.

### Getting your API key
- **Settings → API Keys** → Generate New Key
- **CLI:** `python3 scripts/manage_api_key.py generate`

### Using the API key
```bash
curl -H "X-API-Key: your-api-key-here" \
  https://your-domain.com/api/v1/agents/

curl -H "X-API-Key: your-api-key-here" \
  https://your-domain.com/api/v1/reports/summary/?preset=last_30_days

curl -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"caller_number": "1234567890", "dialed_number": "6312460001"}' \
  https://your-domain.com/api/v1/get-agent
```

The API key is automatically skipped when a valid JWT session (web login) is present.

---

## 13. SSL / HTTPS

The system enforces HTTPS in production:
- HTTP (port 80) → 301 redirect → HTTPS (port 443)
- TLS 1.2 & 1.3 with strong ciphers
- Let's Encrypt certificate (auto-renewable)
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection

---

## 14. Production Deployment

### Prerequisites
- Linux host with Docker and Docker Compose
- Domain pointing to server's public IP
- Ports 80 and 443 open in firewall

### Setup steps
```bash
# 1. Clone and configure
git clone https://github.com/your-org/your-repo.git
cd your-repo

# 2. Set environment variables
cp .env.production .env
# Edit .env with strong SECRET_KEY, DB_PASSWORD

# 3. Set API key for external access
python3 scripts/manage_api_key.py generate

# 4. Get SSL certificate
docker run --rm -p 80:80 \
  -v /path/to/certs:/etc/letsencrypt/live \
  certbot/certbot certonly --standalone \
  -d your-domain.com

# 5. Update nginx server_name in nginx/default.conf
#    Replace "_" with "your-domain.com"

# 6. Build and start
docker compose build
docker compose up -d

# 7. Verify
curl https://your-domain.com/health
```

### Service management
```bash
docker compose logs -f backend    # Backend logs
docker compose logs -f frontend   # Frontend logs
docker compose logs -f nginx      # Nginx logs
docker compose restart backend    # Restart backend
docker compose down -v            # Full teardown (deletes data)
```

---

## 15. Data Backup & Restore

### Via UI
Settings → Backup & Restore → Export JSON / Import JSON

### Via CLI
```bash
# Export
docker exec routing-postgres pg_dump -U routing_user asterisk_routing > backup.sql

# Restore
cat backup.sql | docker exec -i routing-postgres psql -U routing_user asterisk_routing
```

### Reset to default
```bash
# Wipe all call data (keep agents, categories, DIDs)
docker exec routing-postgres psql -U routing_user -d asterisk_routing \
  -c "TRUNCATE call_logs, agent_selection_audit CASCADE;"

# Full wipe
docker compose down -v && docker compose up -d
```

---

## 16. API Reference

All endpoints require either `X-API-Key` header or JWT Bearer token (from web login).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/api/v1/auth/login/` | Login |
| GET | `/api/v1/agents/` | List agents |
| GET | `/api/v1/reports/summary/` | Summary stats |
| GET | `/api/v1/reports/agents/summary/` | Agent stats |
| GET | `/api/v1/reports/categories/` | Category stats |
| GET | `/api/v1/reports/dids/` | DID stats |
| GET | `/api/v1/reports/export/?format=csv` | Export CSV |
| GET | `/api/v1/reports/export/?format=pdf` | Export PDF |
| GET | `/api/v1/callers/` | List callers |
| POST | `/api/v1/get-agent/` | Route a call |
| GET | `/api/v1/config/api-key` | Get masked API key |
| POST | `/api/v1/config/api-key/regenerate` | Generate new API key |

---

## 17. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Blank page after login | Stale JS bundle | Clear browser cache, rebuild frontend |
| Login rejected | Inactive user | Settings → Users → Activate |
| Reports show zeros | No call logs or wrong filter | Check time range, verify calls exist |
| API returns 401 | Missing API key | Add `X-API-Key` header |
| API returns 403 | Invalid API key | Regenerate key in Settings |
| HTTPS not working | Port blocked / DNS not propagated | Check firewall, wait for DNS |
| Sticky routing not working | Sticky window too short | Increase in Settings → Routing |
| Calls not routing | No active agent assignments | Check category has agents with weight totalling 100 |
| Cannot connect to AMI | Wrong credentials or host | Verify in Settings → AMI Connection |

---

## 18. Best Practices

- Use strong, unique passwords for all user accounts
- Rotate API keys periodically
- Keep category assignment weights totalling exactly 100
- Deactivate instead of delete when history matters
- Monitor repeat caller rate — high rate may indicate sticky window is too long
- Review blocked callers list weekly
- Test routing rules with a few test calls before production
- Back up the database before major configuration changes
- Use environment-specific `.env` files per deployment
