"""Agent task writeback: an agent that picked an incident off the queue reports
which agent it is and what status the work is in."""
import json
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import Incident, AgentTaskUpdate, AuditLog
from app.schemas.agent_task import (
    AgentTaskUpdateCreate,
    AgentTaskUpdateResponse,
    AgentTaskUpdateListResponse,
)

router = APIRouter(tags=["agent-tasks"])


def _to_response(u: AgentTaskUpdate) -> AgentTaskUpdateResponse:
    return AgentTaskUpdateResponse(
        id=str(u.id),
        incident_id=str(u.incident_id),
        agent_id=u.agent_id,
        agent_name=u.agent_name,
        status=u.status,
        detail=u.detail,
        created_at=u.created_at.isoformat(),
    )


@router.post(
    "/incidents/{incident_id}/agent",
    response_model=AgentTaskUpdateResponse,
    status_code=201,
)
def record_agent_update(
    incident_id: str,
    body: AgentTaskUpdateCreate,
    db: Session = Depends(get_db),
):
    """Record an agent status update for an incident and add it to the timeline."""
    incident = db.query(Incident).filter_by(id=incident_id).first()
    if not incident:
        raise AppError(code="not_found", message="Incident not found", status_code=404)

    update = AgentTaskUpdate(
        id=uuid.uuid4(),
        incident_id=incident.id,
        agent_id=body.agent_id,
        agent_name=body.agent_name,
        status=body.status,
        detail=body.detail,
    )
    db.add(update)
    db.add(AuditLog(
        id=uuid.uuid4(),
        incident_id=incident.id,
        actor_id=None,
        action="agent_update",
        details=json.dumps({
            "agent_id": body.agent_id,
            "agent_name": body.agent_name,
            "status": body.status,
            "detail": body.detail,
        }),
    ))
    db.commit()
    db.refresh(update)
    return _to_response(update)


@router.get(
    "/incidents/{incident_id}/agent",
    response_model=AgentTaskUpdateListResponse,
)
def list_agent_updates(incident_id: str, db: Session = Depends(get_db)):
    """Return the agent status history for an incident (oldest first)."""
    incident = db.query(Incident).filter_by(id=incident_id).first()
    if not incident:
        raise AppError(code="not_found", message="Incident not found", status_code=404)

    updates = (
        db.query(AgentTaskUpdate)
        .filter_by(incident_id=incident.id)
        .order_by(AgentTaskUpdate.created_at.asc())
        .all()
    )
    resp = [_to_response(u) for u in updates]
    return AgentTaskUpdateListResponse(
        incident_id=incident_id,
        latest=resp[-1] if resp else None,
        updates=resp,
        total=len(resp),
    )
