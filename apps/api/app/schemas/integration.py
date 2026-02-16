from pydantic import BaseModel, Field


class IntegrationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(default="webhook")
    description: str | None = None
    route_by_label: str | None = None


class IntegrationResponse(BaseModel):
    id: str
    service_id: str
    name: str
    type: str
    integration_key: str
    description: str | None
    route_by_label: str | None
    last_event_at: str | None
    event_count_24h: int
    created_at: str

    class Config:
        from_attributes = True
