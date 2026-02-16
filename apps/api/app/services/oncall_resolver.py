"""Resolve who is on-call for a schedule at a given time."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import ScheduleOverride, ScheduleLayer, ScheduleLayerUser


def resolve_oncall(schedule_id: uuid.UUID, at_time: datetime, db: Session) -> uuid.UUID | None:
    """Determine who is on-call for a schedule at the given time.

    Priority:
    1. Active override (most recently created wins if overlapping)
    2. Layer rotation (lowest position = highest priority)
    3. None (coverage gap)
    """
    if at_time.tzinfo is None:
        at_time = at_time.replace(tzinfo=timezone.utc)

    # 1. Check overrides
    override = (
        db.query(ScheduleOverride)
        .filter(
            ScheduleOverride.schedule_id == schedule_id,
            ScheduleOverride.start_time <= at_time,
            ScheduleOverride.end_time > at_time,
        )
        .order_by(ScheduleOverride.created_at.desc())
        .first()
    )
    if override:
        return override.user_id

    # 2. Check layers (lowest position first = highest priority)
    layers = (
        db.query(ScheduleLayer)
        .filter(ScheduleLayer.schedule_id == schedule_id)
        .order_by(ScheduleLayer.position.asc())
        .all()
    )

    for layer in layers:
        elapsed = (at_time - layer.rotation_virtual_start).total_seconds()
        if elapsed < 0:
            continue

        users = (
            db.query(ScheduleLayerUser)
            .filter(ScheduleLayerUser.layer_id == layer.id)
            .order_by(ScheduleLayerUser.position.asc())
            .all()
        )
        if not users:
            continue

        turn_index = int(elapsed / layer.rotation_turn_length_seconds)
        user_index = turn_index % len(users)
        return users[user_index].user_id

    # 3. No coverage
    return None
