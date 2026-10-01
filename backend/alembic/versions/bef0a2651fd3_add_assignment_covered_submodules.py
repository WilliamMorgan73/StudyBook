"""add assignment covered submodules

Revision ID: bef0a2651fd3
Revises: 49620cdc8e57
Create Date: 2026-10-01 13:10:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'bef0a2651fd3'
down_revision: str | Sequence[str] | None = '49620cdc8e57'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'assignment_submodules',
        sa.Column('assignment_id', sa.Integer(), nullable=False),
        sa.Column('submodule_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['submodule_id'], ['submodules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('assignment_id', 'submodule_id'),
    )


def downgrade() -> None:
    op.drop_table('assignment_submodules')
