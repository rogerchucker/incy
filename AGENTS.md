# AGENTS.md — Incy Codebase Guide for AI Agents

This file provides context for AI coding agents working on the Incy codebase.

## Project Overview

Incy is a PagerDuty-inspired incident management system. It handles event ingestion, alert deduplication, incident lifecycle, on-call scheduling, escalation policies, and notifications.

## Stack

- **Backend:** FastAPI (Python 3.13+), SQLAlchemy ORM, Alembic migrations
- **Frontend:** Next.js 15 (App Router), Tailwind CSS, shadcn/ui, TanStack React Query
- **Database:** PostgreSQL 16
- **Worker:** Python polling process (DB-backed job queue)
- **Package manager:** uv (Python), npm (Node.js)
- **Local infra:** Docker Compose (Postgres + Mailpit)

## Repository Layout

```
apps/
  api/                 FastAPI backend
    app/
      models/          SQLAlchemy models (one file per model)
      schemas/         Pydantic request/response schemas
      routes/          FastAPI route handlers
      services/        Business logic (event_processor, incident_manager, etc.)
      middleware/      Error handler, rate limiter, CORS
    alembic/
      versions/        Migration files (linear chain)
  web/                 Next.js frontend
    src/
      app/             App Router pages
      components/ui/   shadcn/ui components
      lib/
        api.ts         API client (all backend calls)
        types.ts       TypeScript interfaces matching API schemas
    e2e/
      fixtures/        Playwright mock data (api-mocks.ts)
      *.spec.ts        E2E test files
  worker/              Notification worker
infra/
  docker-compose.yml   Postgres 16 + Mailpit
```

## Key Conventions

### Backend

- **Every endpoint** has Pydantic request/response models.
- **Error shape:** `{ "error": { "code": "...", "message": "...", "details": {...} } }` — handled by `AppError` in `middleware/error_handler.py`.
- **Migrations:** Every schema change needs an Alembic migration. Migrations chain linearly via `down_revision`. Check the latest file in `alembic/versions/` for the current head.
- **State transitions:** Use `SELECT ... FOR UPDATE` row locking for incident state changes. See `incident_manager.py`.
- **Idempotency:** Events have a unique `idempotency_key`. Grafana events use `grafana-firing-{fingerprint}-{startsAt}`.
- **Timestamps:** UTC everywhere. Use `datetime.now(timezone.utc)`.
- **Auth:** MVP uses hardcoded seed users + `X-User-Id` header. No real auth system.

### Frontend

- **Client components** only when needed (interactivity). Server components by default.
- **Data fetching:** TanStack React Query via `useQuery` / `useMutation`. API calls go through `lib/api.ts`.
- **`API_BASE`** is exported from `lib/api.ts` — always use it for URLs in components.
- **Types** in `lib/types.ts` must stay in sync with backend Pydantic schemas.
- **Date formatting:** Use `date-fns` (`formatDistanceToNow`, etc.).

### E2E Tests

- All tests use Playwright `page.route()` to mock API responses — **no running backend needed**.
- Mock data lives in `e2e/fixtures/api-mocks.ts`. Each mock setup function (e.g., `mockIncidentsAPI`) configures routes for a page.
- When adding new API fields, update both the `Mock*` interfaces and the mock data objects in `api-mocks.ts`.

## Domain Concepts

### Incident Lifecycle
```
triggered → acknowledged → resolved
```
- **triggered:** New incident, pages on-call user immediately.
- **acknowledged:** On-call user has seen it; escalation pauses.
- **resolved:** Incident is closed.

### Event Flow
```
Event (raw) → Alert (deduped by dedup_key + service) → Incident
```
- Same `dedup_key` on same service increments alert count instead of creating a new incident.
- Core logic in `app/services/event_processor.py`.

### Grafana Integration
- `POST /webhooks/grafana?integration_key=...` accepts native Grafana webhook payloads.
- `route_by_label` on an integration enables dynamic service routing: the specified label's value is matched against `service.slug`.
- Resolved alerts find the open alert by `dedup_key` alone (globally unique `grafana-{fingerprint}`).

### Escalation
- Escalation policies have ordered rules targeting users or schedules.
- When an incident is created, the policy is **snapshotted** onto the incident.
- The worker checks `next_escalation_at` and escalates to the next rule.

### Notifications
- Jobs stored in `notification_attempts` table with status: `queued → sending → sent / failed → retrying → dead`.
- Worker uses `FOR UPDATE SKIP LOCKED` for atomic claiming.
- Exponential backoff + jitter on failure, dead-lettered after 5 attempts.

## Common Tasks

### Adding a new API field

1. Add column to the SQLAlchemy model in `apps/api/app/models/`.
2. Create an Alembic migration in `apps/api/alembic/versions/` chaining from the current head.
3. Add field to the relevant Pydantic schemas in `apps/api/app/schemas/`.
4. Update route handlers in `apps/api/app/routes/` (creation + response helpers).
5. Add field to TypeScript types in `apps/web/src/lib/types.ts`.
6. Update API client in `apps/web/src/lib/api.ts` if the field is user-settable.
7. Update the UI page in `apps/web/src/app/`.
8. Update mock data in `apps/web/e2e/fixtures/api-mocks.ts`.

### Adding a new API endpoint

1. Add the route handler in the appropriate file in `apps/api/app/routes/`.
2. Create Pydantic schemas if needed.
3. Register the router in `apps/api/app/routes/__init__.py` if it's a new file.
4. Add the corresponding function to `apps/web/src/lib/api.ts`.
5. Add TypeScript types if the response is a new shape.

### Running the app

```bash
make up          # Start Postgres + Mailpit
make migrate     # Run Alembic migrations
make seed        # Seed demo data
make dev         # Start API (8000) + worker + frontend (3000)
```

### Running tests

```bash
make test        # Backend + frontend tests
make test-e2e    # Playwright E2E tests only
# or directly:
cd apps/web && npx playwright test
```

## Important Files

| File | Purpose |
|------|---------|
| `apps/api/app/services/event_processor.py` | Core event → alert → incident logic |
| `apps/api/app/services/incident_manager.py` | Concurrency-safe ack/resolve with row locking |
| `apps/api/app/routes/grafana_webhooks.py` | Grafana adapter with label-based routing |
| `apps/api/app/middleware/error_handler.py` | Consistent error response formatting |
| `apps/web/src/lib/api.ts` | All frontend API calls |
| `apps/web/src/lib/types.ts` | TypeScript interfaces (must match backend schemas) |
| `apps/web/e2e/fixtures/api-mocks.ts` | Playwright mock data for E2E tests |
| `CLAUDE.md` | Detailed project instructions and working style |
| `PLAN.md` | Original MVP implementation plan |
