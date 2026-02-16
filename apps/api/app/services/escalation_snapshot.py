"""Build escalation policy snapshot at incident creation time."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import EscalationPolicy, EscalationRule, User
from app.services.oncall_resolver import resolve_oncall


def build_escalation_snapshot(policy_id: uuid.UUID, db: Session) -> dict | None:
    """Build a frozen snapshot of an escalation policy with resolved targets.

    The snapshot is stored on the incident and used by the worker for escalation.
    This means the worker never re-resolves schedules -- it uses the snapshot as-is.
    """
    policy = db.query(EscalationPolicy).filter_by(id=policy_id).first()
    if not policy:
        return None

    rules = (
        db.query(EscalationRule)
        .filter_by(escalation_policy_id=policy_id)
        .order_by(EscalationRule.position.asc())
        .all()
    )

    now = datetime.now(timezone.utc)
    snapshot_rules = []

    for rule in rules:
        targets = []
        if rule.target_type == "user":
            user = db.query(User).filter_by(id=rule.target_id).first()
            targets.append({
                "type": "user",
                "user_id": str(rule.target_id),
                "user_name": user.name if user else "Unknown",
            })
        elif rule.target_type == "schedule":
            resolved_user_id = resolve_oncall(rule.target_id, now, db)
            resolved_user = db.query(User).filter_by(id=resolved_user_id).first() if resolved_user_id else None
            targets.append({
                "type": "schedule",
                "schedule_id": str(rule.target_id),
                "resolved_user_id": str(resolved_user_id) if resolved_user_id else None,
                "resolved_user_name": resolved_user.name if resolved_user else None,
            })

        snapshot_rules.append({
            "position": rule.position,
            "escalation_delay_in_minutes": rule.escalation_delay_in_minutes,
            "targets": targets,
        })

    return {
        "policy_id": str(policy.id),
        "policy_name": policy.name,
        "num_loops": policy.num_loops,
        "rules": snapshot_rules,
    }


def get_target_user_id_from_rule(rule_snapshot: dict) -> str | None:
    """Extract the user ID to notify from a snapshot rule."""
    for target in rule_snapshot.get("targets", []):
        if target["type"] == "user":
            return target.get("user_id")
        elif target["type"] == "schedule":
            return target.get("resolved_user_id")
    return None
