# Incy

A minimalist yet reliable incident management system inspired by PagerDuty. Built with FastAPI, Next.js, and PostgreSQL.

Incy handles event ingestion, alert deduplication, incident lifecycle management, on-call scheduling, escalation policies, and notification — all backed by a durable, DB-driven architecture.

## Features

### Event Ingestion & Incident Creation

- **Idempotent event ingestion** — `POST /v1/events` accepts webhook payloads with a unique `idempotency_key`. Duplicate events are safely rejected.
- **Alert deduplication** — Events with the same `dedup_key` on a service are grouped into a single alert. New dedup keys create new alerts and incidents.
- **Automatic assignment** — New incidents are assigned based on escalation policy (if configured) or the service's primary on-call user.

### Grafana Webhook Adapter

- **Native Grafana integration** — `POST /webhooks/grafana?integration_key=...` accepts Grafana alerting webhook payloads directly.
- **Label-based dynamic routing** — Integrations can set `route_by_label` (e.g., `"service"`) to route alerts to different services based on a Grafana label value matching `service.slug`. Falls back to the integration's default service if no match.
- **Auto-resolve** — Grafana "resolved" alerts automatically resolve the corresponding incident.
- **Severity mapping** — Maps Grafana severity labels (`critical`, `warning`, `info`, `none`) to Incy severity levels.

### Incident Lifecycle

- **States:** triggered → acknowledged → resolved
- **Acknowledge** stops further escalation for the incident.
- **Resolve** closes the incident.
- **Edit** — update title, details, severity on open incidents.
- **Notes** — add timestamped notes to the incident timeline.
- All state transitions use row-level locking (`SELECT ... FOR UPDATE`) for concurrency safety.
- Every action is recorded in an immutable audit log / timeline.

### On-Call Schedules

- **Multi-layer schedules** — Create schedules with multiple rotation layers, each with configurable turn length and user ordering.
- **Overrides** — Temporarily override who is on-call (e.g., for PTO swaps).
- **Current on-call resolution** — `GET /v1/schedules/{id}/oncall` computes who is currently on-call at any point in time, respecting layers and overrides.
- **Timezone-aware** — Schedules support configurable timezones.

### Escalation Policies

- **Multi-step escalation** — Define ordered rules that escalate to users or schedules with configurable delays.
- **Looping** — Policies can loop through rules multiple times before stopping.
- **Snapshot-based** — When an incident is created, the escalation policy is snapshotted onto the incident so changes to the policy don't affect in-flight incidents.
- **Worker-driven escalation** — The notification worker checks for incidents past their `next_escalation_at` and escalates to the next rule.

### Notifications

- **DB-backed queue** — Notification jobs stored in `notification_attempts` with status tracking (queued → sending → sent / failed → retrying → dead).
- **Email** — SMTP delivery (Mailpit for local dev).
- **Outbound webhooks** — HMAC-SHA256 signed HTTP deliveries to subscriber endpoints on `incident.triggered`, `incident.acknowledged`, `incident.resolved`.
- **Retry with backoff** — Exponential backoff + jitter, dead-lettered after 5 attempts.
- **Atomic claiming** — Worker uses `FOR UPDATE SKIP LOCKED` for safe concurrent processing.

### Teams & Users

- Create teams, add/remove members with roles (admin/member).
- Create users with name, email, phone.
- Unique constraint on team membership — no duplicate user+team pairs.

### Services & Integrations

- CRUD for services scoped to a team, with on-call user assignment and optional escalation policy.
- Create integrations per service — each gets a unique `integration_key` for event ingestion.
- **Dynamic routing** — Set `route_by_label` on an integration to route alerts to different services based on alert label values matching `service.slug`.
- **Key rotation** — Rotate an integration key instantly; the old key stops working immediately.
- **Health tracking** — Each integration tracks `last_event_at` and exposes a 24-hour event count.
- **Test endpoint** — `POST /v1/services/{sid}/integrations/{iid}/test` sends a synthetic event through the normal pipeline to verify the integration works.

### Frontend (Next.js)

- **Incidents list** — Filterable by status (triggered/acknowledged/resolved) and service, with severity badges.
- **Incident detail** — Timeline, acknowledge/resolve actions, edit title/details/severity, add notes, timestamps.
- **Services list** — Create service with team, on-call user, and escalation policy selection.
- **Service detail** — View/create integrations (with optional `route_by_label`), rotate keys, webhook URL, test events, health status, setup guide.
- **Schedules** — List, create, detail with layers and overrides, current on-call display.
- **Escalation policies** — List, create with multi-step rules, detail with linked services.

### E2E Tests (25 passing)

All tests use Playwright with `page.route()` API mocking — no running backend needed.

- **incidents.spec.ts** (8 tests) — List display, status badges, status filter, navigation, detail view with timeline, acknowledge, resolve.
- **services.spec.ts** (8 tests) — List display, create service, navigation, integration list, webhook example, create integration, webhook URL display, health status.
- **schedules.spec.ts** (5 tests) — List display, on-call user card, create schedule, detail with layers, create override.
- **escalation-policies.spec.ts** (4 tests) — List display, create policy with rules, detail with escalation chain, linked services.

## Architecture

```
apps/
  api/          FastAPI backend (Python)
  web/          Next.js frontend (App Router, Tailwind, shadcn/ui)
  worker/       Notification worker (Python, polls DB)
infra/
  docker-compose.yml   Postgres 16 + Mailpit
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| **Events** | | |
| `POST` | `/v1/events` | Ingest event (idempotent) |
| **Grafana Webhooks** | | |
| `POST` | `/webhooks/grafana?integration_key=...` | Ingest Grafana alert payload (supports label-based routing) |
| **Incidents** | | |
| `GET` | `/v1/incidents` | List incidents (filter: `status`, `service_id`) |
| `GET` | `/v1/incidents/{id}` | Get incident detail |
| `PATCH` | `/v1/incidents/{id}` | Update incident (title, details, severity) |
| `POST` | `/v1/incidents/{id}/acknowledge` | Acknowledge incident |
| `POST` | `/v1/incidents/{id}/resolve` | Resolve incident |
| `POST` | `/v1/incidents/{id}/notes` | Add note to timeline |
| `GET` | `/v1/incidents/{id}/timeline` | Get audit log / timeline |
| **Services** | | |
| `GET` | `/v1/services` | List services |
| `POST` | `/v1/services` | Create service |
| `GET` | `/v1/services/{id}` | Get service |
| `PUT` | `/v1/services/{id}` | Update service |
| **Integrations** | | |
| `GET` | `/v1/services/{id}/integrations` | List integrations |
| `POST` | `/v1/services/{id}/integrations` | Create integration (supports `route_by_label`) |
| `POST` | `/v1/services/{sid}/integrations/{iid}/rotate-key` | Rotate integration key |
| `POST` | `/v1/services/{sid}/integrations/{iid}/test` | Send test event |
| **Schedules** | | |
| `GET` | `/v1/schedules` | List schedules |
| `POST` | `/v1/schedules` | Create schedule (with layers) |
| `GET` | `/v1/schedules/{id}` | Get schedule detail |
| `PUT` | `/v1/schedules/{id}` | Update schedule |
| `DELETE` | `/v1/schedules/{id}` | Delete schedule |
| `GET` | `/v1/schedules/{id}/oncall` | Get current on-call user |
| `GET` | `/v1/schedules/{id}/overrides` | List overrides |
| `POST` | `/v1/schedules/{id}/overrides` | Create override |
| `DELETE` | `/v1/schedules/{id}/overrides/{oid}` | Delete override |
| **Escalation Policies** | | |
| `GET` | `/v1/escalation-policies` | List escalation policies |
| `POST` | `/v1/escalation-policies` | Create policy (with rules) |
| `GET` | `/v1/escalation-policies/{id}` | Get policy detail |
| `PUT` | `/v1/escalation-policies/{id}` | Update policy |
| `DELETE` | `/v1/escalation-policies/{id}` | Delete policy |
| **Teams** | | |
| `GET` | `/v1/teams` | List teams |
| `POST` | `/v1/teams` | Create team |
| `GET` | `/v1/teams/{id}` | Get team with members |
| `POST` | `/v1/teams/{id}/members` | Add member |
| `DELETE` | `/v1/teams/{id}/members/{uid}` | Remove member |
| **Users** | | |
| `GET` | `/v1/users` | List users |
| `POST` | `/v1/users` | Create user |
| `GET` | `/v1/users/{id}` | Get user |
| **Outbound Webhooks** | | |
| `POST` | `/v1/services/{id}/webhooks` | Create subscription |
| `GET` | `/v1/services/{id}/webhooks` | List subscriptions |
| `DELETE` | `/v1/services/{id}/webhooks/{wid}` | Delete subscription |

### Data Model

User, Team, Membership, Service, Integration, Event, Alert, Incident, Schedule, ScheduleLayer, ScheduleLayerUser, ScheduleOverride, EscalationPolicy, EscalationRule, NotificationAttempt, AuditLog, WebhookSubscription.

### Key Design Decisions

- **Auth:** Hardcoded seed user + `X-User-Id` header (simplest for MVP).
- **On-call:** Schedule-based rotation with override support, or direct `primary_oncall_user_id` + `secondary_oncall_user_id` on Service.
- **Escalation:** Snapshot-based — policy is copied to the incident at creation time.
- **Notifications:** DB-backed queue — no Redis/RabbitMQ dependency.
- **Webhooks:** HMAC-SHA256 signed, delivered by the same worker pipeline.
- **Grafana routing:** `route_by_label` on integrations enables one webhook endpoint to route alerts to different services dynamically.
- **E2E tests:** Playwright `page.route()` mocking — tests run without a backend.

## Running Locally

### Prerequisites

- Docker (for Postgres + Mailpit)
- Python 3.13+
- Node.js 18+
- [uv](https://github.com/astral-sh/uv) (Python package manager)

### Quick Start

```bash
# 1. Start Postgres + Mailpit
make up

# 2. Install Python deps
uv sync

# 3. Run migrations + seed demo data
make migrate
make seed

# 4. Start everything (API + worker + frontend)
make dev
```

- **API:** http://localhost:8000 (docs at http://localhost:8000/docs)
- **Frontend:** http://localhost:3000
- **Mailpit:** http://localhost:8025

### Seed Data

The seed script creates:
- **Team:** Platform Team
- **Users:** Alice Engineer (alice@example.com), Bob Oncall (bob@example.com)
- **Service:** Payment API (primary on-call: Alice, secondary: Bob)
- **Integration:** Datadog Webhook
- **Incidents:** 3 sample incidents (one triggered, one acknowledged, one resolved)
- **Webhook subscription:** Sample outbound webhook

### Smoke Test

```bash
# Send an event via generic endpoint
curl -X POST http://localhost:8000/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "integration_key": "int_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "dedup_key": "test-alert-1",
    "summary": "Test alert from curl",
    "severity": "critical",
    "source": "manual",
    "idempotency_key": "test-001"
  }'

# Send an event via Grafana webhook adapter
curl -X POST "http://localhost:8000/webhooks/grafana?integration_key=int_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "firing",
    "alerts": [{
      "status": "firing",
      "labels": {"alertname": "HighCPU", "severity": "critical", "service": "payment-api"},
      "annotations": {"summary": "CPU above 90%"},
      "fingerprint": "abc123",
      "startsAt": "2026-02-15T00:00:00Z"
    }]
  }'

# List incidents
curl http://localhost:8000/v1/incidents | python3 -m json.tool
```

### Outbound Webhooks

```bash
# Create a subscription
curl -X POST http://localhost:8000/v1/services/<service_id>/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-endpoint.example.com/hooks",
    "events": ["incident.triggered", "incident.acknowledged", "incident.resolved"]
  }'
```

Each delivery includes an `X-Incy-Signature-256` header (HMAC-SHA256). Verify by computing `HMAC-SHA256(secret, raw_body)`.

Deliveries retry with exponential backoff + jitter, up to 5 attempts, with a 10-second timeout.

### Make Targets

| Target | Description |
|--------|-------------|
| `make up` | Start Postgres + Mailpit |
| `make down` | Stop infrastructure |
| `make migrate` | Run Alembic migrations |
| `make seed` | Seed demo data |
| `make dev` | Start API + worker + frontend |
| `make dev-api` | Start FastAPI (port 8000) |
| `make dev-worker` | Start notification worker |
| `make dev-web` | Start Next.js (port 3000) |
| `make test` | Run backend + frontend tests |
| `make test-e2e` | Run Playwright E2E tests |
| `make lint` | Run ruff + eslint |

### Running E2E Tests

```bash
cd apps/web && npx playwright test
```

No running backend required — all API calls are mocked via Playwright route interception.
