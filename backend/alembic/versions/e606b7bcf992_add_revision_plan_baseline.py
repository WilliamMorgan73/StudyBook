"""add revision plan baseline to assignments

Revision ID: e606b7bcf992
Revises: 3dd0d71c0e03
Create Date: 2026-10-02 13:01:19.553409

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e606b7bcf992'
down_revision: str | Sequence[str] | None = '3dd0d71c0e03'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('assignments', sa.Column('revision_planned_at', sa.DateTime(), nullable=True))
    op.add_column('assignments', sa.Column('revision_planned_weakness', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('assignments', 'revision_planned_weakness')
    op.drop_column('assignments', 'revision_planned_at')
