import secrets
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import Service, WebhookSubscription
from app.schemas.webhook import (
    WebhookSubscriptionCreate,
    WebhookSubscriptionResponse,
    WebhookSubscriptionListResponse,
)

VALID_EVENTS = {"incident.triggered", "incident.acknowledged", "incident.resolved"}

router = APIRouter(tags=["webhooks"])


@router.post(
    "/services/{service_id}/webhooks",
    response_model=WebhookSubscriptionResponse,
    status_code=201,
)
def create_webhook(
    service_id: str,
    body: WebhookSubscriptionCreate,
    db: Session = Depends(get_db),
):
    service = db.query(Service).filter_by(id=service_id).first()
    if not service:
        raise AppError(code="not_found", message="Service not found", status_code=404)

    invalid = set(body.events) - VALID_EVENTS
    if invalid:
        raise AppError(
            code="invalid_events",
            message=f"Invalid event types: {', '.join(sorted(invalid))}",
            status_code=400,
        )

    subscription = WebhookSubscription(
        id=uuid.uuid4(),
        service_id=uuid.UUID(service_id),
        url=body.url,
        secret=secrets.token_hex(32),
        events=",".join(body.events),
        active=True,
        description=body.description,
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return _to_response(subscription)


@router.get(
    "/services/{service_id}/webhooks",
    response_model=WebhookSubscriptionListResponse,
)
def list_webhooks(service_id: str, db: Session = Depends(get_db)):
    service = db.query(Service).filter_by(id=service_id).first()
    if not service:
        raise AppError(code="not_found", message="Service not found", status_code=404)

    subs = (
        db.query(WebhookSubscription)
        .filter_by(service_id=service_id, active=True)
        .order_by(WebhookSubscription.created_at.desc())
        .all()
    )
    return WebhookSubscriptionListResponse(
        webhooks=[_to_response(s) for s in subs],
        total=len(subs),
    )


@router.delete("/services/{service_id}/webhooks/{webhook_id}", status_code=204)
def delete_webhook(service_id: str, webhook_id: str, db: Session = Depends(get_db)):
    sub = (
        db.query(WebhookSubscription)
        .filter_by(id=webhook_id, service_id=service_id)
        .first()
    )
    if not sub:
        raise AppError(code="not_found", message="Webhook subscription not found", status_code=404)

    db.delete(sub)
    db.commit()


def _to_response(sub: WebhookSubscription) -> WebhookSubscriptionResponse:
    return WebhookSubscriptionResponse(
        id=str(sub.id),
        service_id=str(sub.service_id),
        url=sub.url,
        secret=sub.secret,
        events=sub.events.split(","),
        active=sub.active,
        description=sub.description,
        created_at=sub.created_at.isoformat(),
    )
