"""add lecture duration

Revision ID: acd99db4153c
Revises: 9b81f58734e5
Create Date: 2026-09-17 18:41:44.034738

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'acd99db4153c'
down_revision: str | Sequence[str] | None = '9b81f58734e5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('lectures', sa.Column('duration_minutes', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('lectures', 'duration_minutes')
