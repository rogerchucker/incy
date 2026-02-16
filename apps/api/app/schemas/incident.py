from pydantic import BaseModel, Field


class IncidentResponse(BaseModel):
    id: str
    service_id: str
    title: str
    details: str | None = None
    status: str
    severity: str
    incident_number: int
    assigned_to: str | None
    acknowledged_by: str | None
    resolved_by: str | None
    escalation_level: int
    current_escalation_rule_index: int = 0
    next_escalation_at: str | None = None
    created_at: str
    acknowledged_at: str | None
    resolved_at: str | None
    updated_at: str

    class Config:
        from_attributes = True


class IncidentListResponse(BaseModel):
    incidents: list[IncidentResponse]
    total: int


class IncidentActionResponse(BaseModel):
    id: str
    status: str
    message: str


class IncidentUpdate(BaseModel):
    title: str | None = None
    details: str | None = None
    severity: str | None = Field(None, pattern="^(critical|warning|info)$")


class NoteCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
