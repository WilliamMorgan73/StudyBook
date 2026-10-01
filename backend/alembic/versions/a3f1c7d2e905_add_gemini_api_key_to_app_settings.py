"""add gemini_api_key to app_settings

Revision ID: a3f1c7d2e905
Revises: 5c2e8b71d9a4
Create Date: 2026-10-01 18:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a3f1c7d2e905'
down_revision: str | Sequence[str] | None = '5c2e8b71d9a4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('app_settings', sa.Column('gemini_api_key', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('app_settings', 'gemini_api_key')
