import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String, DateTime, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AgentTaskUpdate(Base):
    """A status writeback from an agent that picked up an incident (task) off the queue.

    Append-only: each update is a row, so the progression (claimed -> in_progress ->
    completed) is preserved as history.
    """

    __tablename__ = "agent_task_updates"
    __table_args__ = (
        Index("ix_agent_task_updates_incident_id", "incident_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=False
    )
    agent_id: Mapped[str] = mapped_column(String(128), nullable=False)
    agent_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
