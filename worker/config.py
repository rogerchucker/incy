from pydantic import field_validator
from pydantic_settings import BaseSettings


class WorkerSettings(BaseSettings):
    database_url: str = "postgresql+psycopg://incy:incy@localhost:5433/incy"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "incy@example.com"
    smtp_user: str = ""
    smtp_password: str = ""
    poll_interval: int = 5
    escalation_timeout_seconds: int = 300
    max_notification_attempts: int = 5
    webhook_timeout: int = 10

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_db_driver(cls, v: str) -> str:
        # DigitalOcean managed DB provides postgresql:// — psycopg3 needs postgresql+psycopg://
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

    class Config:
        env_prefix = "INCY_"
        env_file = ".env"


worker_settings = WorkerSettings()
