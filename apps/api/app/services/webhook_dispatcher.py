"""Enqueue outbound webhook deliveries for incident lifecycle events."""
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Incident, NotificationAttempt, WebhookSubscription


def enqueue_webhook_deliveries(db: Session, incident: Incident, event_type: str) -> int:
    """Create NotificationAttempt rows for each matching active webhook subscription.

    Returns the number of deliveries enqueued.
    """
    subscriptions = (
        db.query(WebhookSubscription)
        .filter_by(service_id=incident.service_id, active=True)
        .all()
    )

    count = 0
    now = datetime.now(timezone.utc)

    for sub in subscriptions:
        subscribed_events = {e.strip() for e in sub.events.split(",")}
        if event_type not in subscribed_events:
            continue

        delivery_id = uuid.uuid4()
        payload = json.dumps({
            "id": str(delivery_id),
            "event_type": event_type,
            "timestamp": now.isoformat(),
            "data": {
                "incident": {
                    "id": str(incident.id),
                    "service_id": str(incident.service_id),
                    "title": incident.title,
                    "status": incident.status,
                    "severity": incident.severity,
                    "incident_number": incident.incident_number,
                    "escalation_level": incident.escalation_level,
                    "created_at": incident.created_at.isoformat(),
                    "updated_at": incident.updated_at.isoformat() if incident.updated_at else now.isoformat(),
                }
            },
        })

        db.add(NotificationAttempt(
            id=delivery_id,
            incident_id=incident.id,
            user_id=None,
            webhook_subscription_id=sub.id,
            channel="webhook",
            status="queued",
            payload=payload,
        ))
        count += 1

    return count
