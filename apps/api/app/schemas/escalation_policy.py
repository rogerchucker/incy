from pydantic import BaseModel, Field


class EscalationRuleCreate(BaseModel):
    escalation_delay_in_minutes: int = Field(..., gt=0)
    target_type: str = Field(..., pattern="^(user|schedule)$")
    target_id: str


class EscalationPolicyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    team_id: str
    num_loops: int = Field(1, ge=1, le=9)
    rules: list[EscalationRuleCreate] = Field(..., min_length=1)


class EscalationPolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    num_loops: int | None = Field(None, ge=1, le=9)
    rules: list[EscalationRuleCreate] | None = None


class EscalationRuleResponse(BaseModel):
    id: str
    position: int
    escalation_delay_in_minutes: int
    target_type: str
    target_id: str
    target_name: str | None = None


class EscalationPolicyResponse(BaseModel):
    id: str
    name: str
    description: str | None
    team_id: str
    num_loops: int
    rules: list[EscalationRuleResponse] = []
    services_count: int = 0
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class EscalationPolicyListResponse(BaseModel):
    escalation_policies: list[EscalationPolicyResponse]
    total: int
