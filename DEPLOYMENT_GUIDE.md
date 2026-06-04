# Efada Smart Agent Routing — Deployment Guide

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Server Setup](#2-server-setup)
3. [Installation](#3-installation)
4. [Configuration](#4-configuration)
5. [Starting the System](#5-starting-the-system)
6. [First-Time Setup](#6-first-time-setup)
7. [SSL/HTTPS Setup](#7-sslhttps-setup)
8. [Backup & Restore](#8-backup--restore)
9. [Maintenance](#9-maintenance)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 20.04+ / Debian 11+ / CentOS 8+ | Ubuntu 22.04 LTS |
| CPU | 1 core | 2+ cores |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB | 20 GB+ |
| Docker | 20.10+ | Latest |
| Docker Compose | v2.0+ | Latest |

### Required Software

Install Docker and Docker Compose:

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt-get update
sudo apt-get install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

---

## 2. Server Setup

### Create a dedicated user (recommended)

```bash
sudo useradd -m -s /bin/bash routing
sudo usermod -aG docker routing
sudo su - routing
```

### Open firewall ports

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp    # HTTP (web UI)
sudo ufw allow 443/tcp   # HTTPS (if using SSL)
sudo ufw enable

# iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

---

## 3. Installation

### Clone or copy the project

```bash
cd ~
# If using git:
git clone <your-repo-url> asterisk-routing-system
cd asterisk-routing-system

# Or upload the project folder via scp/sftp
```

### Project structure

```
asterisk-routing-system/
├── docker-compose.yml        # Main orchestration
├── .env                      # Environment secrets
├── .env.example              # Template
├── backend/                  # FastAPI backend
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py           # Entry point
│       ├── api/              # API routes
│       ├── core/             # Config, DB, Auth
│       ├── models/           # SQLAlchemy models
│       └── services/         # Routing engine
├── frontend/                 # React + Vite
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── ami-watcher/              # AMI event listener
│   ├── Dockerfile
│   └── watcher.py
└── nginx/                    # Reverse proxy config
    └── default.conf
```

---

## 4. Configuration

### Create `.env` file

```bash
cp .env.example .env
nano .env
```

### Required environment variables

```bash
# Database — CHANGE THIS PASSWORD
DB_PASSWORD=YourStrongPasswordHere123!

# App — CHANGE THIS SECRET
SECRET_KEY=your-random-secret-key-min-32-chars-long

# Redis
REDIS_URL=redis://redis:6379/0

# Sticky agent window (days — how long to remember repeat callers)
STICKY_WINDOW_DAYS=30

# Debug mode (set false in production)
DEBUG=false

# CORS — add your domain(s)
ALLOWED_ORIGINS=http://localhost,http://your-server-ip,https://yourdomain.com
```

### Generate secure values

```bash
# Generate DB password
openssl rand -base64 24

# Generate SECRET_KEY
openssl rand -hex 32
```

---

## 5. Starting the System

### Build and start all services

```bash
cd ~/asterisk-routing-system

# Build images
docker compose build

# Start in background
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Expected output

```
NAME                STATUS              PORTS
routing-postgres    Up (healthy)        0.0.0.0:5433->5432/tcp
routing-redis       Up (healthy)        0.0.0.0:6380->6379/tcp
routing-backend     Up                  0.0.0.0:8000->8000/tcp
routing-frontend    Up                  0.0.0.0:3000->3000/tcp
routing-nginx       Up                  0.0.0.0:80->80/tcp
routing-ami-watcher Up
```

### Access the web UI

```
http://your-server-ip
```

### Service ports

| Service | Internal Port | External Port | Purpose |
|---|---|---|---|
| Nginx | 80 | 80 | Web UI + API gateway |
| Backend | 8000 | 8000 | API (direct, not exposed in prod) |
| Frontend | 3000 | 3000 | React dev server |
| PostgreSQL | 5432 | 5433 | Database |
| Redis | 6379 | 6380 | Cache + agent status |

---

## 6. First-Time Setup

### 1. Register admin account

Open the web UI and click **Register**. The first registered user automatically becomes admin.

```
Username: admin
Password: <your-password>
```

### 2. Create agents

Go to **Agents** → **+ Add Agent**

```
Name:       John Smith
Extension:  1001
Email:      john@company.com
Weight:     100
```

### 3. Create a category

Go to **Categories** → **+ Add Category**

```
Customer Name:    Acme Corp
Category:         Sales Line
Contact Number:   +15551234567
Email:            sales@acme.com
```

In the same form:
- Add **DID** (the phone number that will be routed)
- Select **agents** and their routing strategy

### 4. Verify routing

```bash
curl -X POST http://localhost/api/v1/route/ \
  -H "Content-Type: application/json" \
  -d '{"caller_number": "+15559876543", "dialed_number": "+15551234567"}'
```

Expected response:
```json
{
  "status": "routed",
  "agent_extension": "1001",
  "agent_name": "John Smith",
  "agent_id": 1,
  "category": "Sales Line",
  "category_id": 1,
  "repeat": false,
  "strategy": "weighted"
}
```

---

## 7. SSL/HTTPS Setup

### Using Let's Encrypt (recommended)

```bash
# Install certbot
sudo apt-get install -y certbot

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Update nginx config
nano nginx/default.conf
```

Add to nginx config:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # ... existing location blocks ...
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}
```

Mount certificates in `docker-compose.yml`:

```yaml
nginx:
  volumes:
    - ./nginx/default.conf:/etc/nginx/conf.d/default.conf
    - /etc/letsencrypt:/etc/letsencrypt:ro
```

```bash
docker compose up -d nginx
```

---

## 8. Backup & Restore

### Export backup (via web UI)

Go to **Settings** → **Backup** → **Export Backup**

### Export backup (via API)

```bash
TOKEN="your-jwt-token"

curl -o backup.json http://localhost/api/v1/backup/export/ \
  -H "Authorization: Bearer $TOKEN"
```

### Restore backup (via web UI)

Go to **Settings** → **Backup** → **Restore Backup** → Select JSON file

### Automated daily backup (cron)

```bash
# Add to crontab
crontab -e

# Daily at 2 AM
0 2 * * * curl -s -o /backups/routing_$(date +\%Y\%m\%d).json http://localhost/api/v1/backup/export/ -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 9. Maintenance

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f ami-watcher
```

### Restart a service

```bash
docker compose restart backend
docker compose restart nginx
```

### Update the application

```bash
cd ~/asterisk-routing-system
git pull origin main          # or copy new files
docker compose build
docker compose up -d
```

### Database access

```bash
docker exec -it routing-postgres psql -U routing_user -d asterisk_routing
```

### Reset admin password

```bash
docker exec -it routing-postgres psql -U routing_user -d asterisk_routing \
  -c "UPDATE users SET password_hash = '\$2b\$12\$...' WHERE username = 'admin';"
```

Or use the Settings → Reset Password feature in the web UI.

### Clean up Docker

```bash
# Remove old containers and images
docker system prune -a

# Remove volumes (WARNING: deletes all data)
docker compose down -v
```

---

## 10. Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs <service-name>

# Common issues:
# - Port already in use: change ports in docker-compose.yml
# - Permission denied: check file ownership
# - DB connection failed: verify .env DB_PASSWORD
```

### "Connection refused" on web UI

```bash
# Check nginx is running
docker compose ps nginx

# Check backend is healthy
curl http://localhost/api/v1/health
```

### Database migration errors

```bash
# Tables are auto-created on startup. If schema issues:
docker compose down
docker volume rm asterisk-routing-system_postgres_data
docker compose up -d
```

### Redis connection errors

```bash
# Check Redis
docker exec -it routing-redis redis-cli ping
# Should return: PONG
```

### AMI Watcher not connecting to Asterisk

The AMI watcher is a placeholder. To connect to your Asterisk server, edit `ami-watcher/watcher.py`:

```python
# In _poll_servers(), add your Asterisk AMI connection:
async def _poll_servers(self):
    import panalyzer  # or aioami
    # Connect to Asterisk AMI on port 5038
    # Listen for Newstate, Hangup, PeerStatus events
    # Call self.update_agent_status(extension, status)
```

You also need to configure `manager.conf` on your Asterisk server:

```ini
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[routing_user]
secret = ami_password
deny = 0.0.0.0/0.0.0.0
permit = routing-server-ip/255.255.255.255
read = system,call,log,verbose,command,agent,user,config,command,dtmf,reporting,cdr,dialplan
write = system,call,agent,user,command,originate
```

---

## Quick Reference

| What | Where |
|---|---|
| Web UI | `http://your-server-ip` |
| API Docs | `http://your-server-ip/api/v1/docs` |
| Health Check | `http://your-server-ip/api/v1/health` |
| Config File | `~/asterisk-routing-system/.env` |
| Logs | `docker compose logs -f` |
| Database | `routing-postgres` container, port 5433 |
| Redis | `routing-redis` container, port 6380 |
