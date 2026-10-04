"""add lecture submodules

Revision ID: b7e2d4f1a9c3
Revises: 50ae9887823c
Create Date: 2026-10-04 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7e2d4f1a9c3'
down_revision: str | Sequence[str] | None = '50ae9887823c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'lecture_submodules',
        sa.Column('lecture_id', sa.Integer(), nullable=False),
        sa.Column('submodule_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['lecture_id'], ['lectures.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['submodule_id'], ['submodules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('lecture_id', 'submodule_id'),
    )


def downgrade() -> None:
    op.drop_table('lecture_submodules')
