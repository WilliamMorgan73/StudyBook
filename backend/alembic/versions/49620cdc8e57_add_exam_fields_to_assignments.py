"""add exam fields to assignments

Revision ID: 49620cdc8e57
Revises: ae68ba0d112a
Create Date: 2026-10-01 12:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '49620cdc8e57'
down_revision: str | Sequence[str] | None = 'ae68ba0d112a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'assignments',
        sa.Column(
            'kind',
            sa.Enum('coursework', 'exam', name='assignmentkind', native_enum=False),
            server_default='coursework',
            nullable=False,
        ),
    )
    op.add_column('assignments', sa.Column('duration_minutes', sa.Integer(), nullable=True))
    op.add_column('assignments', sa.Column('location', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('assignments', 'location')
    op.drop_column('assignments', 'duration_minutes')
    op.drop_column('assignments', 'kind')
