import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import (
    Schedule, ScheduleLayer, ScheduleLayerUser, ScheduleOverride,
    User, Team, EscalationRule,
)
from app.schemas.schedule import (
    ScheduleCreate, ScheduleUpdate, ScheduleResponse, ScheduleListResponse,
    ScheduleLayerResponse, ScheduleLayerUserResponse,
    ScheduleOverrideResponse, OnCallResponse, OverrideCreate,
)
from app.services.oncall_resolver import resolve_oncall

router = APIRouter(tags=["schedules"])


@router.get("/schedules", response_model=ScheduleListResponse)
def list_schedules(db: Session = Depends(get_db)):
    schedules = db.query(Schedule).order_by(Schedule.created_at.desc()).all()
    return ScheduleListResponse(
        schedules=[_to_response(s, db) for s in schedules],
        total=len(schedules),
    )


@router.post("/schedules", response_model=ScheduleResponse, status_code=201)
def create_schedule(body: ScheduleCreate, db: Session = Depends(get_db)):
    team = db.query(Team).filter_by(id=body.team_id).first()
    if not team:
        raise AppError(code="not_found", message="Team not found", status_code=404)

    schedule = Schedule(
        id=uuid.uuid4(),
        name=body.name,
        description=body.description,
        time_zone=body.time_zone,
        team_id=uuid.UUID(body.team_id),
    )
    db.add(schedule)
    db.flush()

    for i, layer_data in enumerate(body.layers):
        layer = ScheduleLayer(
            id=uuid.uuid4(),
            schedule_id=schedule.id,
            name=layer_data.name,
            position=i,
            rotation_virtual_start=datetime.fromisoformat(layer_data.rotation_virtual_start),
            rotation_turn_length_seconds=layer_data.rotation_turn_length_seconds,
        )
        db.add(layer)
        db.flush()

        for j, user_data in enumerate(layer_data.users):
            db.add(ScheduleLayerUser(
                id=uuid.uuid4(),
                layer_id=layer.id,
                user_id=uuid.UUID(user_data.user_id),
                position=j,
            ))

    db.commit()
    db.refresh(schedule)
    return _to_response(schedule, db)


@router.get("/schedules/{schedule_id}", response_model=ScheduleResponse)
def get_schedule(schedule_id: str, db: Session = Depends(get_db)):
    schedule = db.query(Schedule).filter_by(id=schedule_id).first()
    if not schedule:
        raise AppError(code="not_found", message="Schedule not found", status_code=404)
    return _to_response(schedule, db)


@router.put("/schedules/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(schedule_id: str, body: ScheduleUpdate, db: Session = Depends(get_db)):
    schedule = db.query(Schedule).filter_by(id=schedule_id).first()
    if not schedule:
        raise AppError(code="not_found", message="Schedule not found", status_code=404)

    if body.name is not None:
        schedule.name = body.name
    if body.description is not None:
        schedule.description = body.description
    if body.time_zone is not None:
        schedule.time_zone = body.time_zone

    if body.layers is not None:
        # Replace all layers
        db.query(ScheduleLayerUser).filter(
            ScheduleLayerUser.layer_id.in_(
                db.query(ScheduleLayer.id).filter_by(schedule_id=schedule.id)
            )
        ).delete(synchronize_session=False)
        db.query(ScheduleLayer).filter_by(schedule_id=schedule.id).delete(synchronize_session=False)

        for i, layer_data in enumerate(body.layers):
            layer = ScheduleLayer(
                id=uuid.uuid4(),
                schedule_id=schedule.id,
                name=layer_data.name,
                position=i,
                rotation_virtual_start=datetime.fromisoformat(layer_data.rotation_virtual_start),
                rotation_turn_length_seconds=layer_data.rotation_turn_length_seconds,
            )
            db.add(layer)
            db.flush()

            for j, user_data in enumerate(layer_data.users):
                db.add(ScheduleLayerUser(
                    id=uuid.uuid4(),
                    layer_id=layer.id,
                    user_id=uuid.UUID(user_data.user_id),
                    position=j,
                ))

    db.commit()
    db.refresh(schedule)
    return _to_response(schedule, db)


@router.delete("/schedules/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: str, db: Session = Depends(get_db)):
    schedule = db.query(Schedule).filter_by(id=schedule_id).first()
    if not schedule:
        raise AppError(code="not_found", message="Schedule not found", status_code=404)

    # Reject if referenced by escalation rules
    rule_ref = db.query(EscalationRule).filter_by(target_type="schedule", target_id=schedule_id).first()
    if rule_ref:
        raise AppError(
            code="in_use",
            message="Schedule is referenced by an escalation policy and cannot be deleted",
            status_code=409,
        )

    db.delete(schedule)
    db.commit()


@router.get("/schedules/{schedule_id}/oncall", response_model=OnCallResponse)
def get_oncall(
    schedule_id: str,
    at: str | None = Query(None, description="ISO8601 timestamp"),
    db: Session = Depends(get_db),
):
    schedule = db.query(Schedule).filter_by(id=schedule_id).first()
    if not schedule:
        raise AppError(code="not_found", message="Schedule not found", status_code=404)

    at_time = datetime.fromisoformat(at) if at else datetime.now(timezone.utc)
    user_id = resolve_oncall(schedule.id, at_time, db)

    user_name = None
    if user_id:
        user = db.query(User).filter_by(id=user_id).first()
        user_name = user.name if user else None

    return OnCallResponse(
        schedule_id=str(schedule.id),
        user_id=str(user_id) if user_id else None,
        user_name=user_name,
        at=at_time.isoformat(),
    )


@router.get("/schedules/{schedule_id}/overrides")
def list_overrides(
    schedule_id: str,
    since: str | None = Query(None),
    until: str | None = Query(None),
    db: Session = Depends(get_db),
):
    schedule = db.query(Schedule).filter_by(id=schedule_id).first()
    if not schedule:
        raise AppError(code="not_found", message="Schedule not found", status_code=404)

    query = db.query(ScheduleOverride).filter_by(schedule_id=schedule_id)
    if since:
        query = query.filter(ScheduleOverride.end_time >= datetime.fromisoformat(since))
    if until:
        query = query.filter(ScheduleOverride.start_time <= datetime.fromisoformat(until))

    overrides = query.order_by(ScheduleOverride.start_time.asc()).all()
    return {
        "overrides": [_override_to_response(o, db) for o in overrides],
        "total": len(overrides),
    }


@router.post("/schedules/{schedule_id}/overrides", response_model=ScheduleOverrideResponse, status_code=201)
def create_override(schedule_id: str, body: OverrideCreate, db: Session = Depends(get_db)):
    schedule = db.query(Schedule).filter_by(id=schedule_id).first()
    if not schedule:
        raise AppError(code="not_found", message="Schedule not found", status_code=404)

    user = db.query(User).filter_by(id=body.user_id).first()
    if not user:
        raise AppError(code="not_found", message="User not found", status_code=404)

    start = datetime.fromisoformat(body.start_time)
    end = datetime.fromisoformat(body.end_time)
    if end <= start:
        raise AppError(code="invalid_range", message="end_time must be after start_time", status_code=400)

    override = ScheduleOverride(
        id=uuid.uuid4(),
        schedule_id=uuid.UUID(schedule_id),
        user_id=uuid.UUID(body.user_id),
        start_time=start,
        end_time=end,
    )
    db.add(override)
    db.commit()
    db.refresh(override)
    return _override_to_response(override, db)


@router.delete("/schedules/{schedule_id}/overrides/{override_id}", status_code=204)
def delete_override(schedule_id: str, override_id: str, db: Session = Depends(get_db)):
    override = db.query(ScheduleOverride).filter_by(id=override_id, schedule_id=schedule_id).first()
    if not override:
        raise AppError(code="not_found", message="Override not found", status_code=404)
    db.delete(override)
    db.commit()


# --- Response builders ---

def _to_response(schedule: Schedule, db: Session) -> ScheduleResponse:
    layers = (
        db.query(ScheduleLayer)
        .filter_by(schedule_id=schedule.id)
        .order_by(ScheduleLayer.position.asc())
        .all()
    )

    layer_responses = []
    for layer in layers:
        users = (
            db.query(ScheduleLayerUser)
            .filter_by(layer_id=layer.id)
            .order_by(ScheduleLayerUser.position.asc())
            .all()
        )
        user_responses = []
        for u in users:
            user_obj = db.query(User).filter_by(id=u.user_id).first()
            user_responses.append(ScheduleLayerUserResponse(
                id=str(u.id),
                user_id=str(u.user_id),
                user_name=user_obj.name if user_obj else None,
                position=u.position,
            ))
        layer_responses.append(ScheduleLayerResponse(
            id=str(layer.id),
            name=layer.name,
            position=layer.position,
            rotation_virtual_start=layer.rotation_virtual_start.isoformat(),
            rotation_turn_length_seconds=layer.rotation_turn_length_seconds,
            users=user_responses,
        ))

    overrides = (
        db.query(ScheduleOverride)
        .filter_by(schedule_id=schedule.id)
        .order_by(ScheduleOverride.start_time.asc())
        .all()
    )

    now = datetime.now(timezone.utc)
    oncall_user_id = resolve_oncall(schedule.id, now, db)
    oncall_user_name = None
    if oncall_user_id:
        user = db.query(User).filter_by(id=oncall_user_id).first()
        oncall_user_name = user.name if user else None

    return ScheduleResponse(
        id=str(schedule.id),
        name=schedule.name,
        description=schedule.description,
        time_zone=schedule.time_zone,
        team_id=str(schedule.team_id),
        layers=layer_responses,
        overrides=[_override_to_response(o, db) for o in overrides],
        current_oncall_user_id=str(oncall_user_id) if oncall_user_id else None,
        current_oncall_user_name=oncall_user_name,
        created_at=schedule.created_at.isoformat(),
        updated_at=schedule.updated_at.isoformat(),
    )


def _override_to_response(override: ScheduleOverride, db: Session) -> ScheduleOverrideResponse:
    user = db.query(User).filter_by(id=override.user_id).first()
    return ScheduleOverrideResponse(
        id=str(override.id),
        schedule_id=str(override.schedule_id),
        user_id=str(override.user_id),
        user_name=user.name if user else None,
        start_time=override.start_time.isoformat(),
        end_time=override.end_time.isoformat(),
        created_at=override.created_at.isoformat(),
    )
