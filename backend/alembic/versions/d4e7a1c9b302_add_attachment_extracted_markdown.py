"""add attachment extracted_markdown

Revision ID: d4e7a1c9b302
Revises: f08dfd5eb566
Create Date: 2026-10-01 15:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4e7a1c9b302'
down_revision: str | Sequence[str] | None = 'f08dfd5eb566'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('attachments', sa.Column('extracted_markdown', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('attachments', 'extracted_markdown')
