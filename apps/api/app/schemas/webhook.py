from pydantic import BaseModel, Field


class WebhookSubscriptionCreate(BaseModel):
    url: str = Field(..., min_length=1)
    events: list[str] = Field(..., min_length=1)
    description: str | None = None


class WebhookSubscriptionResponse(BaseModel):
    id: str
    service_id: str
    url: str
    secret: str
    events: list[str]
    active: bool
    description: str | None
    created_at: str

    class Config:
        from_attributes = True


class WebhookSubscriptionListResponse(BaseModel):
    webhooks: list[WebhookSubscriptionResponse]
    total: int


class WebhookPayload(BaseModel):
    id: str
    event_type: str
    timestamp: str
    data: dict


# --- Grafana webhook adapter schemas ---


class GrafanaAlertLabel(BaseModel):
    alertname: str = ""
    severity: str = "critical"
    service: str = ""
    incy: str = ""

    class Config:
        extra = "allow"


class GrafanaAlertAnnotation(BaseModel):
    summary: str = ""
    description: str = ""

    class Config:
        extra = "allow"


class GrafanaAlert(BaseModel):
    status: str  # "firing" or "resolved"
    labels: GrafanaAlertLabel = GrafanaAlertLabel()
    annotations: GrafanaAlertAnnotation = GrafanaAlertAnnotation()
    fingerprint: str = ""
    startsAt: str = ""
    endsAt: str = ""

    class Config:
        extra = "allow"


class GrafanaWebhookPayload(BaseModel):
    status: str  # "firing" or "resolved"
    alerts: list[GrafanaAlert] = []

    class Config:
        extra = "allow"
