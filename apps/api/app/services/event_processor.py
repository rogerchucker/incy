"""Event processing: dedupe -> alert -> incident creation."""
import json
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.models import Alert, Event, Incident, Integration, Service, AuditLog, NotificationAttempt
from app.services.webhook_dispatcher import enqueue_webhook_deliveries
from app.services.escalation_snapshot import build_escalation_snapshot, get_target_user_id_from_rule


def process_event(
    db: Session,
    event: Event,
    integration: Integration,
    *,
    description: str | None = None,
    service_override: Service | None = None,
) -> None:
    """Process an incoming event: deduplicate into alerts, create incidents if needed."""
    # Update integration health tracking
    integration.last_event_at = datetime.now(timezone.utc)

    if service_override:
        service = service_override
    else:
        service = db.query(Service).filter_by(id=integration.service_id).first()
    if not service:
        return

    # Check for existing open alert with same dedup_key for this service
    existing_alert = (
        db.query(Alert)
        .filter_by(service_id=service.id, dedup_key=event.dedup_key, status="open")
        .first()
    )

    if existing_alert:
        # Deduplicate: increment event count on existing alert
        existing_alert.event_count += 1
        existing_alert.updated_at = datetime.now(timezone.utc)
        return

    # New alert -- create alert and incident
    # Get next incident number
    max_number = db.query(Incident.incident_number).order_by(Incident.incident_number.desc()).first()
    next_number = (max_number[0] + 1) if max_number else 1

    # Build escalation snapshot if service has a policy
    snapshot = None
    assigned_user_id = service.primary_oncall_user_id
    next_escalation_at = None

    if service.escalation_policy_id:
        snapshot = build_escalation_snapshot(service.escalation_policy_id, db)
        if snapshot and snapshot["rules"]:
            first_rule = snapshot["rules"][0]
            target_user = get_target_user_id_from_rule(first_rule)
            if target_user:
                assigned_user_id = uuid.UUID(target_user)
            delay_minutes = first_rule.get("escalation_delay_in_minutes", 5)
            next_escalation_at = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)

    incident = Incident(
        id=uuid.uuid4(),
        service_id=service.id,
        title=event.summary,
        details=description,
        status="triggered",
        severity=event.severity,
        incident_number=next_number,
        assigned_to=assigned_user_id,
        escalation_level=1,
        escalation_policy_snapshot=snapshot,
        current_escalation_rule_index=0,
        escalation_loop_count=0,
        next_escalation_at=next_escalation_at,
    )
    db.add(incident)
    db.flush()

    alert = Alert(
        id=uuid.uuid4(),
        service_id=service.id,
        dedup_key=event.dedup_key,
        summary=event.summary,
        severity=event.severity,
        status="open",
        incident_id=incident.id,
        first_event_id=event.id,
    )
    db.add(alert)

    # Audit log
    db.add(AuditLog(
        incident_id=incident.id,
        action="triggered",
        details=json.dumps({
            "source": event.source,
            "severity": event.severity,
            "dedup_key": event.dedup_key,
        }),
    ))

    # Queue notification for assigned on-call
    if assigned_user_id:
        db.add(NotificationAttempt(
            incident_id=incident.id,
            user_id=assigned_user_id,
            channel="email",
            status="queued",
        ))

    # Queue outbound webhook deliveries
    enqueue_webhook_deliveries(db, incident, "incident.triggered")
