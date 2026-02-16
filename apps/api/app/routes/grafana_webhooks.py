"""Grafana webhook adapter: translates Grafana alert payloads into Incy events."""
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import Integration, Event, Alert, Incident, Service
from app.schemas.webhook import GrafanaWebhookPayload, GrafanaAlert
from app.services.event_processor import process_event
from app.services.incident_manager import resolve_incident

logger = logging.getLogger(__name__)

router = APIRouter(tags=["grafana-webhooks"])

SEVERITY_MAP = {
    "critical": "critical",
    "warning": "warning",
    "info": "info",
    "none": "info",
}


def _build_summary(alert: GrafanaAlert) -> str:
    detail = alert.annotations.summary or alert.annotations.description or "No description"
    name = alert.labels.alertname
    if name:
        return f"{name}: {detail}"
    return detail


def _map_severity(raw: str) -> str:
    return SEVERITY_MAP.get(raw.lower(), "critical")


def _extract_label(alert: GrafanaAlert, label_name: str) -> str | None:
    """Extract a label value from a Grafana alert, checking declared fields and extras."""
    # Check declared fields first
    value = getattr(alert.labels, label_name, None)
    if value:
        return value
    # Check pydantic extra fields
    extras = getattr(alert.labels, "__pydantic_extra__", None)
    if extras and label_name in extras:
        return extras[label_name] or None
    return None


def _resolve_service(db: Session, integration: Integration, alert: GrafanaAlert) -> Service | None:
    """Resolve target service from alert labels, falling back to integration's default service."""
    if integration.route_by_label:
        label_value = _extract_label(alert, integration.route_by_label)
        if label_value:
            matched = db.query(Service).filter_by(slug=label_value).first()
            if matched:
                logger.info("Routed alert to service %s via label %s=%s", matched.slug, integration.route_by_label, label_value)
                return matched
            logger.info("Label %s=%s did not match any service slug, falling back to default", integration.route_by_label, label_value)
    # Fall back to integration's default service
    return db.query(Service).filter_by(id=integration.service_id).first()


@router.post("/webhooks/grafana")
def grafana_webhook(
    body: GrafanaWebhookPayload,
    integration_key: str = Query(..., description="Incy integration key"),
    db: Session = Depends(get_db),
):
    integration = db.query(Integration).filter_by(integration_key=integration_key).first()
    if not integration:
        raise AppError(
            code="invalid_integration_key",
            message="Integration key not found",
            status_code=404,
        )

    results = []

    for alert in body.alerts:
        dedup_key = f"grafana-{alert.fingerprint}"
        summary = _build_summary(alert)
        severity = _map_severity(alert.labels.severity)

        if alert.status == "firing":
            service = _resolve_service(db, integration, alert)
            result = _handle_firing(db, integration, alert, dedup_key, summary, severity, service=service)
        elif alert.status == "resolved":
            result = _handle_resolved(db, integration, alert, dedup_key, summary)
        else:
            result = {"fingerprint": alert.fingerprint, "action": "skipped", "reason": f"unknown status: {alert.status}"}

        results.append(result)

    db.commit()
    return {"ok": True, "processed": len(results), "results": results}


def _handle_firing(
    db: Session,
    integration: Integration,
    alert: GrafanaAlert,
    dedup_key: str,
    summary: str,
    severity: str,
    *,
    service: Service | None = None,
) -> dict:
    idempotency_key = f"grafana-firing-{alert.fingerprint}-{alert.startsAt}"

    # Check idempotency
    existing = db.query(Event).filter_by(idempotency_key=idempotency_key).first()
    if existing:
        return {"fingerprint": alert.fingerprint, "action": "deduplicated", "event_id": str(existing.id)}

    event = Event(
        id=uuid.uuid4(),
        integration_id=integration.id,
        dedup_key=dedup_key,
        summary=summary,
        severity=severity,
        source="grafana",
        payload=json.dumps({
            "labels": dict(alert.labels) if hasattr(alert.labels, "__iter__") else alert.labels.model_dump(),
            "annotations": alert.annotations.model_dump(),
            "fingerprint": alert.fingerprint,
            "startsAt": alert.startsAt,
        }),
        idempotency_key=idempotency_key,
    )
    db.add(event)
    db.flush()

    # Pass annotation description/summary as incident details
    description = alert.annotations.description or alert.annotations.summary or None
    process_event(db, event, integration, description=description, service_override=service)

    return {"fingerprint": alert.fingerprint, "action": "created", "event_id": str(event.id)}


def _handle_resolved(
    db: Session,
    integration: Integration,
    alert: GrafanaAlert,
    dedup_key: str,
    summary: str,
) -> dict:
    # Find open alert by dedup_key alone — grafana-{fingerprint} is globally unique
    # This works regardless of which service the alert was routed to
    open_alert = (
        db.query(Alert)
        .filter_by(dedup_key=dedup_key, status="open")
        .first()
    )

    if not open_alert or not open_alert.incident_id:
        return {"dedup_key": dedup_key, "action": "skipped", "reason": "no open alert found"}

    # Check if incident is already resolved
    incident = db.query(Incident).filter_by(id=open_alert.incident_id).first()
    if not incident or incident.status == "resolved":
        return {"dedup_key": dedup_key, "action": "skipped", "reason": "incident already resolved"}

    # Resolve the incident via existing manager (handles locking, audit log, webhooks)
    try:
        resolve_incident(db, str(open_alert.incident_id), user_id=None)
    except AppError:
        return {"dedup_key": dedup_key, "action": "skipped", "reason": "could not resolve incident"}

    # Close the alert
    open_alert.status = "resolved"
    open_alert.updated_at = datetime.now(timezone.utc)

    return {"dedup_key": dedup_key, "action": "resolved", "incident_id": str(open_alert.incident_id)}
