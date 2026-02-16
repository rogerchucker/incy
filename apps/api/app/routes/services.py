import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import Service, Integration, Team, User, Membership, Event, EscalationPolicy
from app.schemas.service import ServiceCreate, ServiceUpdate, ServiceResponse, ServiceListResponse
from app.schemas.integration import IntegrationCreate, IntegrationResponse
from app.schemas.event import EventResponse
from app.services.event_processor import process_event

router = APIRouter(tags=["services"])


def _validate_oncall_users(
    team_id: str,
    primary_oncall_user_id: str | None,
    secondary_oncall_user_id: str | None,
    db: Session,
) -> None:
    team = db.query(Team).filter_by(id=team_id).first()
    if not team:
        raise AppError(code="not_found", message="Team not found", status_code=404)

    for label, user_id in [("Primary on-call", primary_oncall_user_id), ("Secondary on-call", secondary_oncall_user_id)]:
        if not user_id:
            continue
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            raise AppError(
                code="user_not_found",
                message=f"{label} user not found",
                status_code=400,
            )
        membership = db.query(Membership).filter_by(user_id=user_id, team_id=team_id).first()
        if not membership:
            raise AppError(
                code="user_not_in_team",
                message=f"User '{user.name}' is not a member of team '{team.name}'",
                status_code=400,
            )


@router.get("/services", response_model=ServiceListResponse)
def list_services(db: Session = Depends(get_db)):
    services = db.query(Service).order_by(Service.created_at.desc()).all()
    return ServiceListResponse(
        services=[_to_response(s, db) for s in services],
        total=len(services),
    )


@router.post("/services", response_model=ServiceResponse, status_code=201)
def create_service(body: ServiceCreate, db: Session = Depends(get_db)):
    existing = db.query(Service).filter_by(slug=body.slug).first()
    if existing:
        raise AppError(code="duplicate_slug", message="Service slug already exists", status_code=409)

    _validate_oncall_users(body.team_id, body.primary_oncall_user_id, body.secondary_oncall_user_id, db)

    if body.escalation_policy_id:
        policy = db.query(EscalationPolicy).filter_by(id=body.escalation_policy_id).first()
        if not policy:
            raise AppError(code="not_found", message="Escalation policy not found", status_code=404)

    service = Service(
        id=uuid.uuid4(),
        name=body.name,
        slug=body.slug,
        team_id=uuid.UUID(body.team_id),
        primary_oncall_user_id=uuid.UUID(body.primary_oncall_user_id) if body.primary_oncall_user_id else None,
        secondary_oncall_user_id=uuid.UUID(body.secondary_oncall_user_id) if body.secondary_oncall_user_id else None,
        escalation_policy_id=uuid.UUID(body.escalation_policy_id) if body.escalation_policy_id else None,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return _to_response(service, db)


@router.get("/services/{service_id}", response_model=ServiceResponse)
def get_service(service_id: str, db: Session = Depends(get_db)):
    service = db.query(Service).filter_by(id=service_id).first()
    if not service:
        raise AppError(code="not_found", message="Service not found", status_code=404)
    return _to_response(service, db)


@router.put("/services/{service_id}", response_model=ServiceResponse)
def update_service(service_id: str, body: ServiceUpdate, db: Session = Depends(get_db)):
    service = db.query(Service).filter_by(id=service_id).first()
    if not service:
        raise AppError(code="not_found", message="Service not found", status_code=404)

    _validate_oncall_users(
        str(service.team_id),
        body.primary_oncall_user_id,
        body.secondary_oncall_user_id,
        db,
    )

    if body.name is not None:
        service.name = body.name
    if body.primary_oncall_user_id is not None:
        service.primary_oncall_user_id = uuid.UUID(body.primary_oncall_user_id)
    if body.secondary_oncall_user_id is not None:
        service.secondary_oncall_user_id = uuid.UUID(body.secondary_oncall_user_id)
    if body.escalation_policy_id is not None:
        if body.escalation_policy_id == "":
            service.escalation_policy_id = None
        else:
            policy = db.query(EscalationPolicy).filter_by(id=body.escalation_policy_id).first()
            if not policy:
                raise AppError(code="not_found", message="Escalation policy not found", status_code=404)
            service.escalation_policy_id = uuid.UUID(body.escalation_policy_id)

    db.commit()
    db.refresh(service)
    return _to_response(service, db)


# Integration endpoints nested under services
@router.get("/services/{service_id}/integrations")
def list_integrations(service_id: str, db: Session = Depends(get_db)):
    service = db.query(Service).filter_by(id=service_id).first()
    if not service:
        raise AppError(code="not_found", message="Service not found", status_code=404)

    integrations = db.query(Integration).filter_by(service_id=service_id).all()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    results = []
    for integration in integrations:
        count_24h = db.query(Event).filter(
            Event.integration_id == integration.id,
            Event.created_at >= cutoff,
        ).count()
        results.append(_integration_to_response(integration, event_count_24h=count_24h))
    return {
        "integrations": results,
        "total": len(results),
    }


@router.post("/services/{service_id}/integrations", response_model=IntegrationResponse, status_code=201)
def create_integration(service_id: str, body: IntegrationCreate, db: Session = Depends(get_db)):
    service = db.query(Service).filter_by(id=service_id).first()
    if not service:
        raise AppError(code="not_found", message="Service not found", status_code=404)

    integration = Integration(
        id=uuid.uuid4(),
        service_id=uuid.UUID(service_id),
        name=body.name,
        type=body.type,
        integration_key=f"int_{secrets.token_hex(16)}",
        description=body.description,
        route_by_label=body.route_by_label,
    )
    db.add(integration)
    db.commit()
    db.refresh(integration)
    return _integration_to_response(integration, event_count_24h=0)


@router.post("/services/{service_id}/integrations/{integration_id}/test", response_model=EventResponse)
def test_integration(service_id: str, integration_id: str, db: Session = Depends(get_db)):
    service = db.query(Service).filter_by(id=service_id).first()
    if not service:
        raise AppError(code="not_found", message="Service not found", status_code=404)

    integration = db.query(Integration).filter_by(id=integration_id, service_id=service_id).first()
    if not integration:
        raise AppError(code="not_found", message="Integration not found", status_code=404)

    now = datetime.now(timezone.utc)
    timestamp_ms = int(now.timestamp() * 1000)
    event = Event(
        id=uuid.uuid4(),
        integration_id=integration.id,
        dedup_key=f"_test_{integration.id}_{timestamp_ms}",
        summary=f"[Test] Integration test for {integration.name}",
        severity="info",
        source="incy_test",
        idempotency_key=f"test_{integration.id}_{uuid.uuid4()}",
    )
    db.add(event)
    db.flush()

    process_event(db, event, integration)
    db.commit()
    db.refresh(event)

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


@router.post("/services/{service_id}/integrations/{integration_id}/rotate-key", response_model=IntegrationResponse)
def rotate_integration_key(service_id: str, integration_id: str, db: Session = Depends(get_db)):
    service = db.query(Service).filter_by(id=service_id).first()
    if not service:
        raise AppError(code="not_found", message="Service not found", status_code=404)

    integration = db.query(Integration).filter_by(id=integration_id, service_id=service_id).first()
    if not integration:
        raise AppError(code="not_found", message="Integration not found", status_code=404)

    integration.integration_key = f"int_{secrets.token_hex(16)}"
    db.commit()
    db.refresh(integration)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    count_24h = db.query(Event).filter(
        Event.integration_id == integration.id,
        Event.created_at >= cutoff,
    ).count()
    return _integration_to_response(integration, event_count_24h=count_24h)


def _to_response(service: Service, db: Session | None = None) -> ServiceResponse:
    escalation_policy_name = None
    if service.escalation_policy_id and db:
        policy = db.query(EscalationPolicy).filter_by(id=service.escalation_policy_id).first()
        escalation_policy_name = policy.name if policy else None

    return ServiceResponse(
        id=str(service.id),
        name=service.name,
        slug=service.slug,
        team_id=str(service.team_id),
        primary_oncall_user_id=str(service.primary_oncall_user_id) if service.primary_oncall_user_id else None,
        secondary_oncall_user_id=str(service.secondary_oncall_user_id) if service.secondary_oncall_user_id else None,
        escalation_policy_id=str(service.escalation_policy_id) if service.escalation_policy_id else None,
        escalation_policy_name=escalation_policy_name,
        created_at=service.created_at.isoformat(),
    )


def _integration_to_response(integration: Integration, event_count_24h: int = 0) -> IntegrationResponse:
    return IntegrationResponse(
        id=str(integration.id),
        service_id=str(integration.service_id),
        name=integration.name,
        type=integration.type,
        integration_key=integration.integration_key,
        description=integration.description,
        route_by_label=integration.route_by_label,
        last_event_at=integration.last_event_at.isoformat() if integration.last_event_at else None,
        event_count_24h=event_count_24h,
        created_at=integration.created_at.isoformat(),
    )
