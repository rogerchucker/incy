from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: str
    incident_id: str
    actor_id: str | None
    action: str
    details: str | None
    created_at: str

    class Config:
        from_attributes = True


class TimelineResponse(BaseModel):
    entries: list[AuditLogResponse]
