"""add submodule summary

Revision ID: 7c1f3a9d2e64
Revises: 5b2e8c41d7a9
Create Date: 2026-10-01 21:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7c1f3a9d2e64'
down_revision: str | Sequence[str] | None = '5b2e8c41d7a9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('submodules', sa.Column('summary_markdown', sa.Text(), nullable=True))
    op.add_column('submodules', sa.Column('summary_source_hash', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('submodules', 'summary_source_hash')
    op.drop_column('submodules', 'summary_markdown')
