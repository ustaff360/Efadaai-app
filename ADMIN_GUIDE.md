# Admin Guide

## 1. Server setup

Minimum set for production:
- Linux host with Docker and Docker Compose.
- Open host ports 83, 8002, 5435, 6382 as needed or place behind another reverse proxy.
- Sufficient disk for PostgreSQL volume.

## 2. Docker deployment

```
cp .env.example .env
docker compose build
docker compose up -d
docker compose ps
```

## 3. Environment configuration

Edit `.env` with production values:
- Strong DB password for `DB_PASSWORD`.
- Strong `SECRET_KEY`.
- Real CORS origins in `ALLOWED_ORIGINS`.
- AMI credentials for `ASTERISK_HOST`/`ASTERISK_PORT`/`AMI_USERNAME`/`AMI_PASSWORD` if used.
- Set `DEBUG=false` for production.

Add `backend/app/.env` with matching values if required by app layer.

## 4. Database initialization

Backend initializes schema on startup via SQLAlchemy `Base.metadata.create_all` and runtime `INIT_SQL` for small config tables:
- `smtp_settings`
- `ami_config`

For schema changes, run migrations-style manual review or apply alembic-style SQL under `/home/ahsan/Projects/asterisk-routing-system/backend/migrations`.

## 5. Service management

Restart a single service:
`docker compose restart backend`

Rebuild a single service:
`docker compose up -d --build backend`

Inspect logs:
`docker compose logs -f backend`
`docker compose logs -f frontend`
`docker compose logs -f nginx`

Health:
- Backend: `/api/v1/health`
- Nginx: port `83`

## 6. API Key Management

The system supports API key authentication for external integrations (scripts, third-party services).

**Generate a key:**
```bash
python3 scripts/manage_api_key.py generate
```
This saves the key to `backend/app/.env` and `.env.production`. Restart the backend:
```bash
docker restart routing-backend
```

**View current key:**
```bash
python3 scripts/manage_api_key.py show
python3 scripts/manage_api_key.py show --raw
```

**Via Dashboard:** Settings → API Keys tab → Generate New Key

**Usage in scripts:**
```bash
curl -H "X-API-Key: your-key-here" https://your-domain/api/v1/agents/
```

The API key guard automatically skips when a valid JWT session (frontend login) is detected.

## 7. Backup

- Export PostgreSQL volume or run `pg_dump`.
- Copy config and env files securely.
- The backup API exists for operational flows; use OS-level backup in addition.

## 8. Restore

- Stop backend.
- Restore PostgreSQL database.
- Verify env files match restored environment.
- Restart backend.

## 8. Monitoring

Use health endpoint, Docker resource usage, logs, and report endpoint stats to detect regressions. Alert on repeated non-2xx routing responses, 503 calls from no-agent states, and Redis failures affecting agent status visibility.

## 9. Logging

- Application logs in backend container stdout.
- Routing audit logging in database models via audit service.
- WebSocket events push refresh signals to dashboard clients.

## 10. Upgrade process

1. Pull latest code.
2. Review `README.md`, `API_DOCUMENTATION.md`, and `DEPLOYMENT_GUIDE.md`.
3. Rebuild changed services.
4. Apply schema init or migration changes.
5. Validate `/api/v1/health`.
6. Validate hot path `/api/v1/get-agent`.
7. Roll forward or rollback if needed.

## 11. Git/version discipline

- Use tags for release identification.
- Use branches for features/fixes.
- Do not push secrets.

## 12. Production maintenance

- Rotate secrets periodically.
- Review audit log size and retention.
- Review blocked number list and assignment weights monthly.
