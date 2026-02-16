from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.error_handler import register_error_handlers
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.routes import events, incidents, services, teams, users, webhooks, schedules, escalation_policies, grafana_webhooks

app = FastAPI(title="Incy", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiter
app.add_middleware(RateLimiterMiddleware)

# Error handlers
register_error_handlers(app)

# Routes
app.include_router(events.router, prefix="/v1")
app.include_router(incidents.router, prefix="/v1")
app.include_router(services.router, prefix="/v1")
app.include_router(teams.router, prefix="/v1")
app.include_router(users.router, prefix="/v1")
app.include_router(webhooks.router, prefix="/v1")
app.include_router(schedules.router, prefix="/v1")
app.include_router(escalation_policies.router, prefix="/v1")
app.include_router(grafana_webhooks.router, prefix="/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
