from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    integration_key: str = Field(..., description="Integration key for routing")
    dedup_key: str | None = Field(default=None, description="Deduplication key. Auto-generated from summary hash if omitted.")
    summary: str = Field(..., description="Event summary")
    description: str | None = Field(default=None, description="Longer description, stored as incident details")
    severity: str = Field(default="critical", pattern="^(critical|warning|info)$")
    source: str | None = None
    payload: dict | None = None
    idempotency_key: str | None = Field(default=None, description="Unique key for idempotent ingestion. Auto-generated UUID if omitted.")


class EventResponse(BaseModel):
    id: str
    integration_id: str
    dedup_key: str
    summary: str
    severity: str
    source: str | None
    idempotency_key: str
    created_at: str

    class Config:
        from_attributes = True
