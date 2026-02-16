import hashlib
import json
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import Integration, Event
from app.schemas.event import EventCreate, EventResponse
from app.services.event_processor import process_event

router = APIRouter(tags=["events"])


@router.post("/events", response_model=EventResponse, status_code=201)
def create_event(body: EventCreate, db: Session = Depends(get_db)):
    # Validate integration key
    integration = db.query(Integration).filter_by(integration_key=body.integration_key).first()
    if not integration:
        raise AppError(code="invalid_integration_key", message="Integration key not found", status_code=404)

    # Auto-generate keys if not provided
    idempotency_key = body.idempotency_key or str(uuid.uuid4())
    dedup_key = body.dedup_key or hashlib.sha256(
        f"{integration.id}:{body.summary}:{body.source or ''}".encode()
    ).hexdigest()[:16]

    # Idempotency check
    existing = db.query(Event).filter_by(idempotency_key=idempotency_key).first()
    if existing:
        return _to_response(existing)

    # Create event
    event = Event(
        id=uuid.uuid4(),
        integration_id=integration.id,
        dedup_key=dedup_key,
        summary=body.summary,
        severity=body.severity,
        source=body.source,
        payload=json.dumps(body.payload) if body.payload else None,
        idempotency_key=idempotency_key,
    )
    db.add(event)
    db.flush()

    # Process: dedupe -> alert -> incident
    process_event(db, event, integration, description=body.description)
    db.commit()

    return _to_response(event)


def _to_response(event: Event) -> EventResponse:
    return EventResponse(
        id=str(event.id),
        integration_id=str(event.integration_id),
        dedup_key=event.dedup_key,
        summary=event.summary,
        severity=event.severity,
        source=event.source,
        idempotency_key=event.idempotency_key,
        created_at=event.created_at.isoformat(),
    )
