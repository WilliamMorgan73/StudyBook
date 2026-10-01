"""add revision sessions

Revision ID: 5c2e8b71d9a4
Revises: 7c1f3a9d2e64
Create Date: 2026-10-01 17:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5c2e8b71d9a4'
down_revision: str | Sequence[str] | None = '7c1f3a9d2e64'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'revision_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('assignment_id', sa.Integer(), nullable=False),
        sa.Column('starts_at', sa.DateTime(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('guidance_markdown', sa.Text(), nullable=True),
        sa.Column('done', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_revision_sessions_assignment_id'), 'revision_sessions', ['assignment_id'], unique=False)
    op.create_index(op.f('ix_revision_sessions_starts_at'), 'revision_sessions', ['starts_at'], unique=False)
    op.create_table(
        'revision_session_submodules',
        sa.Column('revision_session_id', sa.Integer(), nullable=False),
        sa.Column('submodule_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['revision_session_id'], ['revision_sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['submodule_id'], ['submodules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('revision_session_id', 'submodule_id'),
    )


def downgrade() -> None:
    op.drop_table('revision_session_submodules')
    op.drop_index(op.f('ix_revision_sessions_starts_at'), table_name='revision_sessions')
    op.drop_index(op.f('ix_revision_sessions_assignment_id'), table_name='revision_sessions')
    op.drop_table('revision_sessions')
