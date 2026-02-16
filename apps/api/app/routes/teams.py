import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import Team, Membership, User
from app.schemas.team import TeamCreate, TeamResponse, TeamListResponse, TeamMemberResponse
from app.schemas.membership import MembershipCreate, MembershipResponse

router = APIRouter(tags=["teams"])


@router.get("/teams", response_model=TeamListResponse)
def list_teams(db: Session = Depends(get_db)):
    teams = db.query(Team).order_by(Team.name).all()
    return TeamListResponse(
        teams=[_to_response(t) for t in teams],
        total=len(teams),
    )


@router.post("/teams", response_model=TeamResponse, status_code=201)
def create_team(body: TeamCreate, db: Session = Depends(get_db)):
    existing = db.query(Team).filter_by(slug=body.slug).first()
    if existing:
        raise AppError(code="duplicate_slug", message="Team slug already exists", status_code=409)

    team = Team(
        id=uuid.uuid4(),
        name=body.name,
        slug=body.slug,
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return _to_response(team)


@router.get("/teams/{team_id}", response_model=TeamResponse)
def get_team(team_id: str, db: Session = Depends(get_db)):
    team = db.query(Team).filter_by(id=team_id).first()
    if not team:
        raise AppError(code="not_found", message="Team not found", status_code=404)
    return _to_response(team, include_members=True, db=db)


@router.post("/teams/{team_id}/members", response_model=MembershipResponse, status_code=201)
def add_member(team_id: str, body: MembershipCreate, db: Session = Depends(get_db)):
    team = db.query(Team).filter_by(id=team_id).first()
    if not team:
        raise AppError(code="not_found", message="Team not found", status_code=404)

    user = db.query(User).filter_by(id=body.user_id).first()
    if not user:
        raise AppError(code="user_not_found", message="User not found", status_code=400)

    existing = db.query(Membership).filter_by(user_id=body.user_id, team_id=team_id).first()
    if existing:
        raise AppError(code="duplicate_membership", message="User is already a member of this team", status_code=409)

    membership = Membership(
        id=uuid.uuid4(),
        user_id=uuid.UUID(body.user_id),
        team_id=uuid.UUID(team_id),
        role=body.role,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return MembershipResponse(
        id=str(membership.id),
        user_id=str(membership.user_id),
        team_id=str(membership.team_id),
        role=membership.role,
        created_at=membership.created_at.isoformat(),
    )


@router.delete("/teams/{team_id}/members/{user_id}", status_code=204)
def remove_member(team_id: str, user_id: str, db: Session = Depends(get_db)):
    membership = db.query(Membership).filter_by(user_id=user_id, team_id=team_id).first()
    if not membership:
        raise AppError(code="not_found", message="Membership not found", status_code=404)

    db.delete(membership)
    db.commit()


def _to_response(team: Team, include_members: bool = False, db: Session | None = None) -> TeamResponse:
    members = None
    if include_members and db:
        memberships = db.query(Membership).filter_by(team_id=team.id).all()
        user_ids = [m.user_id for m in memberships]
        users_by_id = {}
        if user_ids:
            users = db.query(User).filter(User.id.in_(user_ids)).all()
            users_by_id = {u.id: u for u in users}
        members = [
            TeamMemberResponse(
                id=str(m.id),
                user_id=str(m.user_id),
                user_name=users_by_id[m.user_id].name if m.user_id in users_by_id else "Unknown",
                user_email=users_by_id[m.user_id].email if m.user_id in users_by_id else "",
                role=m.role,
                created_at=m.created_at.isoformat(),
            )
            for m in memberships
        ]
    return TeamResponse(
        id=str(team.id),
        name=team.name,
        slug=team.slug,
        created_at=team.created_at.isoformat(),
        members=members,
    )
