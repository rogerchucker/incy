A) Core product capabilities

Event ingestion (FastAPI)

POST /v1/events webhook endpoint

Accept event payload: service_id or integration_key, dedupe_key, severity, summary, source, timestamp, optional details

Idempotency: client supplies event_id or server derives stable hash → enforced by unique index

Dedupe → Alert → Incident

Dedupe into Alert by (service_id, dedupe_key)

Create Incident when first alert triggers (MVP rule)

Subsequent events update alert + append timeline entry

Incident lifecycle

States: triggered, acknowledged, resolved

Actions: ack, resolve (API + UI)

Every transition → audit log entry

Paging + escalation

On trigger: page L1 immediately

If not acked within N minutes: page L2 (optional for MVP; 1 extra step max)

Ack stops future escalation for that incident

Notification channels

MVP: Email (reliable + easiest)

Optional: SMS later (Twilio/etc.) — keep provider abstraction minimal

B) Minimal on-call model (pick one)

Simplest: service.primary_oncall_user_id

Still MVP: 1 schedule per team with one current primary (rotate daily/weekly)

C) Minimal UI (Next.js + shadcn/ui)

Incidents list: status/service/time filters

Incident detail:

header (status, service, created, assigned/on-call)

timeline (audit log + events)

buttons: Ack / Resolve

Services:

create/edit service

set primary on-call or schedule

configure escalation delay (N minutes)

Integrations:

generate webhook key/token

show example curl payload

D) Reliability/operability requirements (the “pretty reliable” part)

DB-backed notification queue (notification_attempts)

Worker with:

retry policy (max attempts, exponential backoff + jitter)

dead-letter state (mark as dead after max attempts)

Concurrency correctness:

incident transitions in transactions

row locking on incident during ack/resolve

Rate limiting ingestion (per integration key)

Basic admin actions:

re-page incident

re-send last notification attempt

temporarily override on-call target

E) Integrations (keep it tight)

Start with generic webhook

Optionally add one “demo-friendly” adapter:

Grafana Alerting webhook or Prometheus Alertmanager webhook

F) Non-goals (explicit)

complex routing rules, slack bots, postmortems, multi-region, advanced scheduling