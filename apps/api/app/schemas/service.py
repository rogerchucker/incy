from pydantic import BaseModel, Field


class ServiceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern="^[a-z0-9-]+$")
    team_id: str
    primary_oncall_user_id: str | None = None
    secondary_oncall_user_id: str | None = None
    escalation_policy_id: str | None = None


class ServiceUpdate(BaseModel):
    name: str | None = None
    primary_oncall_user_id: str | None = None
    secondary_oncall_user_id: str | None = None
    escalation_policy_id: str | None = None


class ServiceResponse(BaseModel):
    id: str
    name: str
    slug: str
    team_id: str
    primary_oncall_user_id: str | None
    secondary_oncall_user_id: str | None
    escalation_policy_id: str | None = None
    escalation_policy_name: str | None = None
    created_at: str

    class Config:
        from_attributes = True


class ServiceListResponse(BaseModel):
    services: list[ServiceResponse]
    total: int
