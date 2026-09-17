"""add app settings

Revision ID: 2936283e7f9d
Revises: acd99db4153c
Create Date: 2026-09-17 19:39:51.679923

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '2936283e7f9d'
down_revision: str | Sequence[str] | None = 'acd99db4153c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('max_credits', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('app_settings')
