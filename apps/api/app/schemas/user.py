from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=1, max_length=255)
    phone: str | None = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    created_at: str

    class Config:
        from_attributes = True
