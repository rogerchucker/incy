"""add unique constraint on memberships(user_id, team_id)

Revision ID: a1b2c3d4e5f6
Revises: 6d574a660cd9
Create Date: 2026-02-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '6d574a660cd9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint('uq_memberships_user_team', 'memberships', ['user_id', 'team_id'])


def downgrade() -> None:
    op.drop_constraint('uq_memberships_user_team', 'memberships', type_='unique')
