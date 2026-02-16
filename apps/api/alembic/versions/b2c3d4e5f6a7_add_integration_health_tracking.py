"""add integration health tracking

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('integrations', sa.Column('last_event_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_events_integration_id_created_at', 'events', ['integration_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_events_integration_id_created_at', table_name='events')
    op.drop_column('integrations', 'last_event_at')
