import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import (
    EscalationPolicy, EscalationRule, Service, Team, User, Schedule,
)
from app.schemas.escalation_policy import (
    EscalationPolicyCreate, EscalationPolicyUpdate,
    EscalationPolicyResponse, EscalationPolicyListResponse,
    EscalationRuleResponse,
)

router = APIRouter(tags=["escalation-policies"])


@router.get("/escalation-policies", response_model=EscalationPolicyListResponse)
def list_policies(db: Session = Depends(get_db)):
    policies = db.query(EscalationPolicy).order_by(EscalationPolicy.created_at.desc()).all()
    return EscalationPolicyListResponse(
        escalation_policies=[_to_response(p, db) for p in policies],
        total=len(policies),
    )


@router.post("/escalation-policies", response_model=EscalationPolicyResponse, status_code=201)
def create_policy(body: EscalationPolicyCreate, db: Session = Depends(get_db)):
    team = db.query(Team).filter_by(id=body.team_id).first()
    if not team:
        raise AppError(code="not_found", message="Team not found", status_code=404)

    policy = EscalationPolicy(
        id=uuid.uuid4(),
        name=body.name,
        description=body.description,
        team_id=uuid.UUID(body.team_id),
        num_loops=body.num_loops,
    )
    db.add(policy)
    db.flush()

    for i, rule_data in enumerate(body.rules):
        _validate_target(rule_data.target_type, rule_data.target_id, db)
        db.add(EscalationRule(
            id=uuid.uuid4(),
            escalation_policy_id=policy.id,
            position=i,
            escalation_delay_in_minutes=rule_data.escalation_delay_in_minutes,
            target_type=rule_data.target_type,
            target_id=uuid.UUID(rule_data.target_id),
        ))

    db.commit()
    db.refresh(policy)
    return _to_response(policy, db)


@router.get("/escalation-policies/{policy_id}", response_model=EscalationPolicyResponse)
def get_policy(policy_id: str, db: Session = Depends(get_db)):
    policy = db.query(EscalationPolicy).filter_by(id=policy_id).first()
    if not policy:
        raise AppError(code="not_found", message="Escalation policy not found", status_code=404)
    return _to_response(policy, db)


@router.put("/escalation-policies/{policy_id}", response_model=EscalationPolicyResponse)
def update_policy(policy_id: str, body: EscalationPolicyUpdate, db: Session = Depends(get_db)):
    policy = db.query(EscalationPolicy).filter_by(id=policy_id).first()
    if not policy:
        raise AppError(code="not_found", message="Escalation policy not found", status_code=404)

    if body.name is not None:
        policy.name = body.name
    if body.description is not None:
        policy.description = body.description
    if body.num_loops is not None:
        policy.num_loops = body.num_loops

    if body.rules is not None:
        # Replace all rules
        db.query(EscalationRule).filter_by(escalation_policy_id=policy.id).delete(synchronize_session=False)
        for i, rule_data in enumerate(body.rules):
            _validate_target(rule_data.target_type, rule_data.target_id, db)
            db.add(EscalationRule(
                id=uuid.uuid4(),
                escalation_policy_id=policy.id,
                position=i,
                escalation_delay_in_minutes=rule_data.escalation_delay_in_minutes,
                target_type=rule_data.target_type,
                target_id=uuid.UUID(rule_data.target_id),
            ))

    db.commit()
    db.refresh(policy)
    return _to_response(policy, db)


@router.delete("/escalation-policies/{policy_id}", status_code=204)
def delete_policy(policy_id: str, db: Session = Depends(get_db)):
    policy = db.query(EscalationPolicy).filter_by(id=policy_id).first()
    if not policy:
        raise AppError(code="not_found", message="Escalation policy not found", status_code=404)

    service_ref = db.query(Service).filter_by(escalation_policy_id=policy_id).first()
    if service_ref:
        raise AppError(
            code="in_use",
            message="Escalation policy is used by a service and cannot be deleted",
            status_code=409,
        )

    db.delete(policy)
    db.commit()


def _validate_target(target_type: str, target_id: str, db: Session) -> None:
    if target_type == "user":
        if not db.query(User).filter_by(id=target_id).first():
            raise AppError(code="not_found", message=f"Target user {target_id} not found", status_code=400)
    elif target_type == "schedule":
        if not db.query(Schedule).filter_by(id=target_id).first():
            raise AppError(code="not_found", message=f"Target schedule {target_id} not found", status_code=400)


def _to_response(policy: EscalationPolicy, db: Session) -> EscalationPolicyResponse:
    rules = (
        db.query(EscalationRule)
        .filter_by(escalation_policy_id=policy.id)
        .order_by(EscalationRule.position.asc())
        .all()
    )

    rule_responses = []
    for rule in rules:
        target_name = None
        if rule.target_type == "user":
            user = db.query(User).filter_by(id=rule.target_id).first()
            target_name = user.name if user else None
        elif rule.target_type == "schedule":
            schedule = db.query(Schedule).filter_by(id=rule.target_id).first()
            target_name = schedule.name if schedule else None

        rule_responses.append(EscalationRuleResponse(
            id=str(rule.id),
            position=rule.position,
            escalation_delay_in_minutes=rule.escalation_delay_in_minutes,
            target_type=rule.target_type,
            target_id=str(rule.target_id),
            target_name=target_name,
        ))

    services_count = db.query(Service).filter_by(escalation_policy_id=policy.id).count()

    return EscalationPolicyResponse(
        id=str(policy.id),
        name=policy.name,
        description=policy.description,
        team_id=str(policy.team_id),
        num_loops=policy.num_loops,
        rules=rule_responses,
        services_count=services_count,
        created_at=policy.created_at.isoformat(),
        updated_at=policy.updated_at.isoformat(),
    )
