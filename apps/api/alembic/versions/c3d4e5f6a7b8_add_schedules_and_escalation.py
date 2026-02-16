"""add schedules and escalation policies

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-02-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- New tables ---

    op.create_table(
        'schedules',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('time_zone', sa.String(100), server_default='UTC', nullable=False),
        sa.Column('team_id', sa.UUID(), sa.ForeignKey('teams.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'schedule_layers',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('schedule_id', sa.UUID(), sa.ForeignKey('schedules.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rotation_virtual_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('rotation_turn_length_seconds', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'schedule_layer_users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('layer_id', sa.UUID(), sa.ForeignKey('schedule_layers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'schedule_overrides',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('schedule_id', sa.UUID(), sa.ForeignKey('schedules.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_schedule_overrides_lookup', 'schedule_overrides', ['schedule_id', 'start_time', 'end_time'])

    op.create_table(
        'escalation_policies',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('team_id', sa.UUID(), sa.ForeignKey('teams.id'), nullable=False),
        sa.Column('num_loops', sa.Integer(), server_default='1', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'escalation_rules',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('escalation_policy_id', sa.UUID(), sa.ForeignKey('escalation_policies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('escalation_delay_in_minutes', sa.Integer(), nullable=False),
        sa.Column('target_type', sa.String(20), nullable=False),
        sa.Column('target_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_escalation_rules_policy_position', 'escalation_rules', ['escalation_policy_id', 'position'])

    # --- Modified tables ---

    # services: add escalation_policy_id
    op.add_column('services', sa.Column('escalation_policy_id', sa.UUID(), sa.ForeignKey('escalation_policies.id'), nullable=True))

    # incidents: add escalation fields
    op.add_column('incidents', sa.Column('escalation_policy_snapshot', postgresql.JSONB(), nullable=True))
    op.add_column('incidents', sa.Column('current_escalation_rule_index', sa.Integer(), server_default='0', nullable=False))
    op.add_column('incidents', sa.Column('escalation_loop_count', sa.Integer(), server_default='0', nullable=False))
    op.add_column('incidents', sa.Column('next_escalation_at', sa.DateTime(timezone=True), nullable=True))

    # Partial index for worker escalation polling
    op.create_index(
        'ix_incidents_escalation_due',
        'incidents',
        ['status', 'next_escalation_at'],
        postgresql_where=sa.text('next_escalation_at IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_incidents_escalation_due', table_name='incidents')
    op.drop_column('incidents', 'next_escalation_at')
    op.drop_column('incidents', 'escalation_loop_count')
    op.drop_column('incidents', 'current_escalation_rule_index')
    op.drop_column('incidents', 'escalation_policy_snapshot')
    op.drop_column('services', 'escalation_policy_id')
    op.drop_index('ix_escalation_rules_policy_position', table_name='escalation_rules')
    op.drop_table('escalation_rules')
    op.drop_table('escalation_policies')
    op.drop_index('ix_schedule_overrides_lookup', table_name='schedule_overrides')
    op.drop_table('schedule_overrides')
    op.drop_table('schedule_layer_users')
    op.drop_table('schedule_layers')
    op.drop_table('schedules')
