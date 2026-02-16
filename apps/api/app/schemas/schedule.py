from pydantic import BaseModel, Field


class ScheduleLayerUserCreate(BaseModel):
    user_id: str


class ScheduleLayerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    rotation_virtual_start: str  # ISO8601
    rotation_turn_length_seconds: int = Field(..., gt=0)
    users: list[ScheduleLayerUserCreate] = Field(..., min_length=1)


class ScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    time_zone: str = "UTC"
    team_id: str
    layers: list[ScheduleLayerCreate] = []


class ScheduleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    time_zone: str | None = None
    layers: list[ScheduleLayerCreate] | None = None


class ScheduleLayerUserResponse(BaseModel):
    id: str
    user_id: str
    user_name: str | None = None
    position: int


class ScheduleLayerResponse(BaseModel):
    id: str
    name: str
    position: int
    rotation_virtual_start: str
    rotation_turn_length_seconds: int
    users: list[ScheduleLayerUserResponse]


class ScheduleOverrideResponse(BaseModel):
    id: str
    schedule_id: str
    user_id: str
    user_name: str | None = None
    start_time: str
    end_time: str
    created_at: str


class ScheduleResponse(BaseModel):
    id: str
    name: str
    description: str | None
    time_zone: str
    team_id: str
    layers: list[ScheduleLayerResponse] = []
    overrides: list[ScheduleOverrideResponse] = []
    current_oncall_user_id: str | None = None
    current_oncall_user_name: str | None = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class ScheduleListResponse(BaseModel):
    schedules: list[ScheduleResponse]
    total: int


class OnCallResponse(BaseModel):
    schedule_id: str
    user_id: str | None
    user_name: str | None = None
    at: str


class OverrideCreate(BaseModel):
    user_id: str
    start_time: str  # ISO8601
    end_time: str  # ISO8601
