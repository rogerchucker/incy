from pydantic import BaseModel, Field


class AgentTaskUpdateCreate(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=128, description="Stable identifier of the agent that picked up the task")
    agent_name: str = Field(..., min_length=1, max_length=255, description="Human-friendly agent name")
    status: str = Field(..., min_length=1, max_length=50, description="Current status, e.g. claimed | in_progress | completed | failed")
    detail: str | None = Field(default=None, description="Optional free-text detail / progress note")


class AgentTaskUpdateResponse(BaseModel):
    id: str
    incident_id: str
    agent_id: str
    agent_name: str
    status: str
    detail: str | None
    created_at: str

    class Config:
        from_attributes = True


class AgentTaskUpdateListResponse(BaseModel):
    incident_id: str
    latest: AgentTaskUpdateResponse | None
    updates: list[AgentTaskUpdateResponse]
    total: int
