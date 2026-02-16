# Incy — CLAUDE.md (Next.js + FastAPI + Postgres)

You are Claude Code helping me build **Incy**, a reliable incident management system inspired by PagerDuty.
Ship an MVP that is dependable, testable, and boring. Avoid bells & whistles. Keep this file (CLAUDE.md) updated with major learnings after every milestone. Always ensure that on track wth the @PLAN.md.

Whwen finishing a task always highlight the commands I need to run to restart the app such that all the changes are being incorporated.

## Stack
- Frontend: Next.js (App Router), Tailwind CSS, shadcn/ui
- Backend: FastAPI (Python), SQLAlchemy (or SQLModel), Alembic migrations
- DB: Postgres
- Delivery worker: Python worker process (can be same repo), DB-backed queue for MVP
- Auth: choose one: NextAuth (email) or backend-issued session/JWT (keep simple)

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

## Repo layout (recommended)
- /apps/web            (Next.js UI)
- /apps/api            (FastAPI)
- /apps/worker         (notification worker)
- /packages/shared     (shared types/schemas: OpenAPI clients, Zod/Pydantic models)
- /infra               (docker-compose, migrations, local dev)
- /docs                (design notes, runbooks for Incy itself)

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
