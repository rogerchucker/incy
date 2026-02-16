from pydantic import BaseModel, Field


class TeamCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern="^[a-z0-9-]+$")


class TeamMemberResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_email: str
    role: str
    created_at: str


class TeamResponse(BaseModel):
    id: str
    name: str
    slug: str
    created_at: str
    members: list[TeamMemberResponse] | None = None

    class Config:
        from_attributes = True


class TeamListResponse(BaseModel):
    teams: list[TeamResponse]
    total: int
