# Developer Guide

## 1. Application architecture

- Backend: FastAPI async, service layer pattern.
- Frontend: React SPA with router-based pages and axios API integration.
- Database: SQLAlchemy models with async sessions.
- Cache: Redis for status, sticky state, and RR counters.
- Ops: Docker Compose backed by Postgres, Redis, Nginx, backend, frontend.

## 2. Folder structure

See README.md for full tree. Key areas:
- Backend entry: `backend/app/main.py`
- API routers: `backend/app/api/*.py`
- Services: `backend/app/services/router.py`, `audit_service.py`
- Core: database, redis, auth, config
- Models: ORM layer
- Frontend: pages under `frontend/src/pages`

## 3. Backend architecture

FastAPI app includes routers:
- `/api/v1/auth`
- `/api/v1/users`
- `/api/v1/agents`
- `/api/v1/categories`
- `/api/v1/callers`
- `/api/v1/calls`
- `/api/v1/reports`
- `/api/v1/audit`
- `/api/v1/config`
- `/api/v1/recordings`
- `/api/v1/route`
- `/api/v1/search`
- `/api/v1/backup`
- `/api/v1/ws`
- `/api/v1/health`

Dependencies:
- Request -> Router -> Service -> Database
- Audit logging via `app.core.audit` / `app.services.audit_service` and per-route audit calls.

Error handling:
- Route alias endpoints wrap errors into HTTPException with 404/500 as appropriate.
- Frontend shows axios-alert fallbacks in many pages.

## 4. Frontend architecture

- `App.jsx` renders the authenticated shell and route pages.
- `AuthContext.jsx` holds auth state.
- Global axios default base URL resolves to `/api/v1`.
- Pages call the documented endpoints.
- `GlobalSearch.jsx` uses `/api/v1/search`.

## 5. Database models

- `User`
- `Agent`
- `Category`
- `CategoryAgent`
- `DID`
- `Caller`
- `CallLog`
- `BlockList`
- `AgentSelectionAudit`

See DATABASE_DOCUMENTATION.md for table-level details.

## 6. Service layer

- `app.services.router.RoutingService`: core routing logic.
- `app.services.audit_service`: audit event helpers.

Add new business behavior as new methods in `RoutingService` or a new service file under `app/services`.

## 7. Routing engine

Located at `backend/app/services/router.py` and duplicated inline in `backend/app/api/calls.py`.

`RoutingService.route_call`:
1. Blocklist check
2. DID -> category
3. Strategy from category
4. Active assignments
5. Idle agent filter
6. Sticky lookup
7. Strategy selection fallback
8. Caller update
9. Call log write
10. Audit write
11. Set sticky
12. Response build

## 8. Sticky routing

- Caller key + category -> Redis sticky agent.
- Returned on repeat within `STICKY_WINDOW_DAYS` when agent is idle.
- Else strategy-based.

## 9. Weighted routing

- Selects from `idle_agents` by weight.
- Round robin uses Redis counter keyed by category.
- Sequential sorts by agent id.

## 10. Audit logging

- `app.core.audit.log_audit` writes generic audit entries.
- Route audit writes extra fields via `app.services.audit_service.log_event`.

## 11. Authentication flow

- Register -> creates token.
- Login -> validates password and returns JWT.
- Protected endpoints use `get_current_user` / `get_current_admin`.
- Password change and profile update supported.

## 12. Middleware

- CORS.
- Redis status integration.
- WebSocket broadcast on route events.

## 13. Error handling

- FastAPI HTTPException usage across routes.
- Route caller returns 404/500 depending on category/DID mismatch or runtime failure.
- Caller list endpoint returns JSONResponse with total count header.

## 14. Logging

- Standard Python logging in routing module.
- Audit logs in database.
- WebSocket events drive pagination refresh in UI.

## 15. Coding standards

- Use service layer for business logic.
- Keep routers thin.
- Use Pydantic schemas for request/response validation.
- Prefer async SQLAlchemy patterns.

## 16. How to add new API

1. Add schemas in `backend/app/api/<resource>.py`.
2. Add route function and include router in `backend/app/main.py`.
3. Add auth or no-auth path as required.
4. Document in `API_DOCUMENTATION.md`.

## 17. How to add new page

1. Create `frontend/src/pages/<Page>.jsx`.
2. Add route in `frontend/src/App.jsx`.
3. Call new endpoints.
4. Update docs.

## 18. How to add new service

1. Create module under `backend/app/services`.
2. Inject `AsyncSession`.
3. Call from route function or existing service.
4. Add audit where required.
