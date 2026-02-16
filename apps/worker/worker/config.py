from pydantic_settings import BaseSettings


class WorkerSettings(BaseSettings):
    database_url: str = "postgresql+psycopg://incy:incy@localhost:5433/incy"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "incy@example.com"
    poll_interval: int = 5
    escalation_timeout_seconds: int = 300
    max_notification_attempts: int = 5
    webhook_timeout: int = 10

    class Config:
        env_prefix = "INCY_"
        env_file = ".env"


worker_settings = WorkerSettings()
