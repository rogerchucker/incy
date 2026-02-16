from pydantic import BaseModel, Field


class MembershipCreate(BaseModel):
    user_id: str
    role: str = Field(default="member", pattern="^(admin|member)$")


class MembershipResponse(BaseModel):
    id: str
    user_id: str
    team_id: str
    role: str
    created_at: str

    class Config:
        from_attributes = True
