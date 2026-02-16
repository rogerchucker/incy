import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.error_handler import AppError
from app.models import User
from app.schemas.user import UserCreate, UserResponse

router = APIRouter(tags=["users"])


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.name).all()
    return {
        "users": [
            UserResponse(
                id=str(u.id),
                name=u.name,
                email=u.email,
                phone=u.phone,
                created_at=u.created_at.isoformat(),
            )
            for u in users
        ],
        "total": len(users),
    }


@router.post("/users", response_model=UserResponse, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter_by(email=body.email).first()
    if existing:
        raise AppError(code="duplicate_email", message="A user with this email already exists", status_code=409)

    user = User(
        id=uuid.uuid4(),
        name=body.name,
        email=body.email,
        phone=body.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        phone=user.phone,
        created_at=user.created_at.isoformat(),
    )


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise AppError(code="not_found", message="User not found", status_code=404)
    return UserResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        phone=user.phone,
        created_at=user.created_at.isoformat(),
    )
