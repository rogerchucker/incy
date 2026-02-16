import json

from fastapi import APIRouter, Depends, Query, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import Incident, AuditLog
from app.schemas.incident import (
    IncidentResponse, IncidentListResponse, IncidentActionResponse,
    IncidentUpdate, NoteCreate,
)
from app.schemas.audit_log import AuditLogResponse, TimelineResponse
from app.services.incident_manager import acknowledge_incident, resolve_incident

router = APIRouter(tags=["incidents"])


@router.get("/incidents", response_model=IncidentListResponse)
def list_incidents(
    status: str | None = Query(None, pattern="^(triggered|acknowledged|resolved)$"),
    service_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Incident)
    if status:
        query = query.filter(Incident.status == status)
    if service_id:
        query = query.filter(Incident.service_id == service_id)

    total = query.count()
    incidents = query.order_by(Incident.created_at.desc()).offset(offset).limit(limit).all()

    return IncidentListResponse(
        incidents=[_to_response(i) for i in incidents],
        total=total,
    )


@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter_by(id=incident_id).first()
    if not incident:
        raise AppError(code="not_found", message="Incident not found", status_code=404)
    return _to_response(incident)


@router.post("/incidents/{incident_id}/acknowledge", response_model=IncidentActionResponse)
def ack_incident(
    incident_id: str,
    x_user_id: str = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    incident = acknowledge_incident(db, incident_id, x_user_id)
    return IncidentActionResponse(
        id=str(incident.id),
        status=incident.status,
        message="Incident acknowledged",
    )


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentActionResponse)
def resolve_incident_endpoint(
    incident_id: str,
    x_user_id: str = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    incident = resolve_incident(db, incident_id, x_user_id)
    return IncidentActionResponse(
        id=str(incident.id),
        status=incident.status,
        message="Incident resolved",
    )


@router.patch("/incidents/{incident_id}", response_model=IncidentResponse)
def update_incident(
    incident_id: str,
    body: IncidentUpdate,
    x_user_id: str = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    incident = db.query(Incident).filter_by(id=incident_id).first()
    if not incident:
        raise AppError(code="not_found", message="Incident not found", status_code=404)

    changes = {}
    if body.title is not None and body.title != incident.title:
        changes["title"] = {"from": incident.title, "to": body.title}
        incident.title = body.title
    if body.details is not None and body.details != incident.details:
        changes["details"] = {"from": incident.details, "to": body.details}
        incident.details = body.details
    if body.severity is not None and body.severity != incident.severity:
        changes["severity"] = {"from": incident.severity, "to": body.severity}
        incident.severity = body.severity

    if changes:
        audit = AuditLog(
            incident_id=incident.id,
            actor_id=x_user_id,
            action="updated",
            details=json.dumps({"changes": changes}),
        )
        db.add(audit)
        db.commit()
        db.refresh(incident)

    return _to_response(incident)


@router.post("/incidents/{incident_id}/notes", response_model=AuditLogResponse)
def add_note(
    incident_id: str,
    body: NoteCreate,
    x_user_id: str = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    incident = db.query(Incident).filter_by(id=incident_id).first()
    if not incident:
        raise AppError(code="not_found", message="Incident not found", status_code=404)

    audit = AuditLog(
        incident_id=incident.id,
        actor_id=x_user_id,
        action="note_added",
        details=json.dumps({"content": body.content}),
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    return AuditLogResponse(
        id=str(audit.id),
        incident_id=str(audit.incident_id),
        actor_id=str(audit.actor_id) if audit.actor_id else None,
        action=audit.action,
        details=audit.details,
        created_at=audit.created_at.isoformat(),
    )


@router.get("/incidents/{incident_id}/timeline", response_model=TimelineResponse)
def get_timeline(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter_by(id=incident_id).first()
    if not incident:
        raise AppError(code="not_found", message="Incident not found", status_code=404)

    entries = (
        db.query(AuditLog)
        .filter_by(incident_id=incident_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    return TimelineResponse(
        entries=[
            AuditLogResponse(
                id=str(e.id),
                incident_id=str(e.incident_id),
                actor_id=str(e.actor_id) if e.actor_id else None,
                action=e.action,
                details=e.details,
                created_at=e.created_at.isoformat(),
            )
            for e in entries
        ]
    )


def _to_response(incident: Incident) -> IncidentResponse:
    return IncidentResponse(
        id=str(incident.id),
        service_id=str(incident.service_id),
        title=incident.title,
        details=incident.details,
        status=incident.status,
        severity=incident.severity,
        incident_number=incident.incident_number,
        assigned_to=str(incident.assigned_to) if incident.assigned_to else None,
        acknowledged_by=str(incident.acknowledged_by) if incident.acknowledged_by else None,
        resolved_by=str(incident.resolved_by) if incident.resolved_by else None,
        escalation_level=incident.escalation_level,
        current_escalation_rule_index=incident.current_escalation_rule_index,
        next_escalation_at=incident.next_escalation_at.isoformat() if incident.next_escalation_at else None,
        created_at=incident.created_at.isoformat(),
        acknowledged_at=incident.acknowledged_at.isoformat() if incident.acknowledged_at else None,
        resolved_at=incident.resolved_at.isoformat() if incident.resolved_at else None,
        updated_at=incident.updated_at.isoformat(),
    )
