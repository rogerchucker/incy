from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://incy:incy@localhost:5433/incy"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "incy@example.com"
    cors_origins: list[str] = ["http://localhost:3000"]
    rate_limit_per_minute: int = 120
    worker_poll_interval: int = 5
    escalation_timeout_seconds: int = 300  # 5 minutes

    class Config:
        env_prefix = "INCY_"
        env_file = ".env"


settings = Settings()
