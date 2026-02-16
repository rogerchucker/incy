"""Concurrency-safe incident state transitions."""
import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.middleware.error_handler import AppError
from app.models import Incident, AuditLog
from app.services.webhook_dispatcher import enqueue_webhook_deliveries


def acknowledge_incident(db: Session, incident_id: str, user_id: str) -> Incident:
    """Acknowledge an incident with row-level locking."""
    # Lock the row to prevent concurrent state changes
    incident = (
        db.query(Incident)
        .filter_by(id=incident_id)
        .with_for_update()
        .first()
    )
    if not incident:
        raise AppError(code="not_found", message="Incident not found", status_code=404)

    if incident.status == "acknowledged":
        raise AppError(code="already_acknowledged", message="Incident already acknowledged", status_code=409)
    if incident.status == "resolved":
        raise AppError(code="already_resolved", message="Cannot acknowledge a resolved incident", status_code=409)

    now = datetime.now(timezone.utc)
    incident.status = "acknowledged"
    incident.acknowledged_by = user_id
    incident.acknowledged_at = now
    incident.updated_at = now
    incident.next_escalation_at = None  # Stop escalation timer

    db.add(AuditLog(
        incident_id=incident.id,
        actor_id=user_id,
        action="acknowledged",
        details=json.dumps({"acknowledged_by": user_id}),
        created_at=now,
    ))

    enqueue_webhook_deliveries(db, incident, "incident.acknowledged")

    db.commit()
    db.refresh(incident)
    return incident


def resolve_incident(db: Session, incident_id: str, user_id: str) -> Incident:
    """Resolve an incident with row-level locking."""
    incident = (
        db.query(Incident)
        .filter_by(id=incident_id)
        .with_for_update()
        .first()
    )
    if not incident:
        raise AppError(code="not_found", message="Incident not found", status_code=404)

    if incident.status == "resolved":
        raise AppError(code="already_resolved", message="Incident already resolved", status_code=409)

    now = datetime.now(timezone.utc)
    incident.status = "resolved"
    incident.resolved_by = user_id
    incident.resolved_at = now
    incident.updated_at = now
    incident.next_escalation_at = None  # Stop escalation timer

    db.add(AuditLog(
        incident_id=incident.id,
        actor_id=user_id,
        action="resolved",
        details=json.dumps({"resolved_by": user_id}),
        created_at=now,
    ))

    enqueue_webhook_deliveries(db, incident, "incident.resolved")

    db.commit()
    db.refresh(incident)
    return incident
