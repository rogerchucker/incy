# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Incy is a reliable, PagerDuty-inspired incident management system. The MVP is built and working — keep it
dependable, testable, and boring. Keep this file updated with major learnings after every milestone, and stay
on track with @PLAN.md. **When finishing a task, always tell me the exact commands to run to restart the app
so my changes take effect.**

Two sibling docs overlap with this one: `README.md` (user-facing feature tour + full API table) and `AGENTS.md`
(codebase guide for AI agents — slightly stale, see "Drift to watch" below). When they conflict with the code,
the code wins.

## Stack (as built)
- **Frontend:** Next.js 15 (App Router), Tailwind, shadcn/ui, TanStack React Query, `date-fns`. Lives in `apps/web`.
- **Backend:** FastAPI + SQLAlchemy ORM + Alembic. Python 3.13, managed with `uv`. Lives in `apps/api`.
- **DB:** PostgreSQL 16 (local: Docker on host port **5433**).
- **Worker:** standalone Python polling process, DB-backed queue (no Redis/broker). Lives in **`worker/`** at the repo root (see drift note — it moved out of `apps/worker`).
- **Auth:** MVP only — hardcoded seed user + `X-User-Id` header. No real auth system.
- **Email (local):** Mailpit (SMTP on 1025, UI on 8025).

## Build, run, test

```bash
make up        # docker compose: Postgres (5433) + Mailpit (1025/8025)
uv sync        # install Python deps into ./.venv
make migrate   # alembic upgrade head   (runs from apps/api)
make seed      # python -m app.seed     (demo team/users/service/incidents)
make dev       # start api (8000) + worker + web (3000) together (backgrounded)
```

Run pieces individually: `make dev-api` (uvicorn, :8000, `/docs` for OpenAPI) · `make dev-web` (Next, :3000).

**Worker:** `make dev-worker` is currently **broken** (it `cd`s into `apps/worker`, but the worker package
now lives at the repo root). Run it directly from the repo root instead:
`PYTHONPATH=. .venv/bin/python -m worker.main`. Fixing the Makefile target is a good cleanup.

**Migrations:** create with `make autogenerate msg="describe change"` then review the generated file in
`apps/api/alembic/versions/` before committing. The chain is linear via `down_revision`; the head is the
newest file there.

**Tests / lint:**
- `make lint` = `ruff check .` (api) + `eslint` (web). This works.
- `make test` is **misleading**: there is **no `apps/api/tests/` directory and no `npm test` script**, so both
  halves fail. The only real tests are the Playwright E2E suite: `cd apps/web && npx playwright test`
  (or `make test-e2e`). It needs no backend — every API call is mocked via `page.route()`.
- Run one E2E spec/test: `cd apps/web && npx playwright test incidents.spec.ts -g "acknowledge"`.

After backend changes restart `dev-api` (uvicorn `--reload` usually catches it) and the worker. After a model
change you must also `make autogenerate` + `make migrate`. Frontend changes hot-reload.

## Working style
### Plan mode first
Before editing code:
1) Output a **Plan** (steps + components touched).
2) List **options + tradeoffs** for major decisions (data model, auth, queue, API boundaries).
3) Recommend one option and **ask before implementing** when it affects architecture.

### Changes must include
- DB migration impact (Alembic)
- API contract changes (OpenAPI + typed schemas)
- Backwards-compat notes
- Test plan + added tests
- Rollout plan (feature flags optional)

## MVP scope (explicit)
We are NOT building:
- full scheduling/rotations, PTO, complex rules
- slack/teams bots, chatops, runbook automation
- analytics, SLOs, status pages, postmortems
- multi-region / active-active

We ARE building:
- event ingestion → dedupe → incident lifecycle
- paging (email first; SMS optional)
- simple escalation (1–2 steps)
- audit log and reliable notification attempts
- integration health tracking (last_event_at, 24h event count) + test endpoint

## Reliability requirements (non-negotiable)
- Idempotent ingestion (event retries do not create duplicates)
- Concurrency-safe incident state transitions
- Durable notification attempts + retry with exponential backoff + jitter
- Rate limiting and backpressure (protect DB and providers)
- Every external call: timeout + retry policy (or explicit no-retry)
- UTC timestamps everywhere

## Repo layout (actual)
- `apps/web/`   — Next.js UI. `src/app/` pages; `src/components/ui/` shadcn; `src/lib/api.ts` (all backend calls, exports `API_BASE`) and `src/lib/types.ts` (must mirror Pydantic schemas); `e2e/` Playwright specs + `e2e/fixtures/api-mocks.ts`.
- `apps/api/`   — FastAPI. `app/models/` (one SQLAlchemy model per file), `app/schemas/` (Pydantic), `app/routes/` (handlers), `app/services/` (business logic), `app/middleware/`. Alembic config + `alembic/versions/`. `app/seed.py` for demo data.
- `worker/`     — notification + escalation worker (`main.py` poll loop, `smtp_sender.py`, `webhook_sender.py`, `config.py`). At the repo root, **not** `apps/worker` (which is now an empty stub).
- `infra/`      — `docker-compose.yml` (Postgres + Mailpit), `chaos/incy-demo.sh` (Grafana k8s demo), `k8s/`, `app.yaml` (DigitalOcean App Platform deploy spec).

There is **no** `packages/shared` or `docs/` directory — types are duplicated by hand between `apps/api/app/schemas/` and `apps/web/src/lib/types.ts`.

## Architecture (the parts that span files)

**Event → incident pipeline** (`app/services/event_processor.py`): a raw `Event` is ingested idempotently
(unique `idempotency_key`), deduped into an `Alert` by `(service, dedup_key)`, which drives `Incident`
creation. Same dedup key on the same service folds into the existing alert/incident instead of creating a new one.

**Two ingestion front-ends:** generic `POST /v1/events` and the Grafana adapter
(`app/routes/grafana_webhooks.py`). Grafana integrations can set `route_by_label` so one webhook URL routes to
different services by matching a label value against `service.slug`; resolved Grafana alerts find their open
alert by a globally-unique `grafana-{fingerprint}` dedup key, so auto-resolve works regardless of routing.

**Incident state machine** (`app/services/incident_manager.py`): `triggered → acknowledged → resolved`, every
transition under `SELECT … FOR UPDATE` row locks for concurrency safety; ack halts escalation; every action
writes an immutable `AuditLog` row (the incident timeline).

**Escalation is snapshot-based** (`app/services/escalation_snapshot.py`, `oncall_resolver.py`): at incident
creation the escalation policy — with on-call resolved through schedule layers + overrides — is **frozen** as
JSON onto the incident, so editing a policy never affects in-flight incidents. The worker advances
`next_escalation_at` rule-by-rule and can loop.

**Notifications are a DB queue**, not a broker. The worker polls `notification_attempts`
(`queued → sending → sent | failed → retrying → dead`), claims rows with `FOR UPDATE SKIP LOCKED` (safe for
concurrent workers), delivers email (SMTP) or signed outbound webhooks (`webhook_dispatcher.py`, HMAC-SHA256
`X-Incy-Signature-256`), retries with exponential backoff + jitter, dead-letters after
`INCY_MAX_NOTIFICATION_ATTEMPTS` (5). The worker re-checks incident state before sending and skips
already-ack'd/resolved incidents. Escalation checks run every 6th poll cycle.

**Config:** all settings are env vars with the `INCY_` prefix (both `app/config.py` and `worker/config.py`).
Defaults work out of the box for local dev. DB default is `postgresql+psycopg://incy:incy@localhost:5433/incy`.

## Drift to watch (verify against code before relying on docs)
- **Routers are registered in `apps/api/app/main.py`** via `include_router(..., prefix="/v1")`, not in
  `app/routes/__init__.py` (which is empty). AGENTS.md's "register in `routes/__init__.py`" step is wrong.
- The **worker moved to the repo root**; `make dev-worker` and the Makefile `PYTHONPATH` still say `apps/worker`.
- `make test` references **non-existent** backend tests and an absent `npm test` script. Real coverage =
  Playwright E2E only.
- README/AGENTS document the Grafana path as `/webhooks/grafana`, but `main.py` mounts that router under the
  `/v1` prefix, so the **actual live path is `/v1/webhooks/grafana`**. The docs (and any curl examples) are wrong.

## API conventions (FastAPI)
- Pydantic request/response models for every endpoint
- Consistent error shape: { "error": { "code": "...", "message": "...", "details": {...}}}
- Use OpenAPI as the source of truth. Prefer generating a typed client for web.

## DB conventions
- Alembic migrations for every schema change (no manual drift)
- Use DB constraints for correctness:
  - unique indexes for idempotency keys
  - FK constraints
  - check constraints for enums if useful
- Use transactions for state transitions; lock rows where needed (SELECT ... FOR UPDATE)

## Domain model (MVP nouns)
- User, Team, Membership
- Service
- Integration (webhook credentials)
- Event (raw)
- Alert (deduped)
- Incident
- EscalationPolicy, EscalationStep
- Schedule (simple) OR direct primary on-call user per service
- NotificationAttempt
- AuditLog (incident timeline)

## Incident lifecycle
States: triggered → acknowledged → resolved
Rules:
- triggered incident pages L1 immediately
- ack stops further escalation for that incident
- resolve closes incident; optionally allow "reopen" if new events arrive (optional)

## Background jobs (MVP)
- Store notification jobs in DB table (notification_attempts) with status:
  queued | sending | sent | failed | retrying | dead
- Worker polls for due jobs, sends, updates status.
- Idempotency: each attempt has stable attempt_id; provider calls should be safe on retry.

## Frontend conventions (Next.js)
- App Router, server components where it helps; client components only when needed.
- Use shadcn/ui components; keep styling minimal and consistent.
- Use React Query (or SWR) for API fetch caching (choose one).
- Use `date-fns` for relative time formatting (already a dependency).
- `API_BASE` is exported from `lib/api.ts` — use it when building URLs in components.
- Keep UI small:
  - incidents list + filters
  - incident details + timeline
  - services + integrations setup (webhook URL, health status, test button, setup guide)
  - ack/resolve actions

## Testing expectations
Backend:
- unit tests for dedupe + state machine
- integration tests with Postgres (docker) for migrations and critical transactions
- API tests for core flows

Worker:
- tests for retry/backoff and provider failure behavior

Frontend:
- light E2E smoke tests (Playwright) for: list → detail → ack → resolve

Always include failure-path tests:
- duplicate events
- concurrent ack/resolve
- provider outage and retries
- worker restart with in-flight jobs

## Dev ergonomics
- docker-compose for postgres + local stack
- make targets or justfile:
  - make dev (api+worker+web)
  - make test
  - make migrate
  - make lint
- seed data command for demo scenarios

## Output format rules
When you respond with implementation steps, include:
- File list to change
- Migrations needed
- API endpoints added/changed
- Tests to add
- Local run commands
