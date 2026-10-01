"""add anthropic_api_key and ai_model to app_settings

Revision ID: f08dfd5eb566
Revises: 1dcbb2054c35
Create Date: 2026-10-01 15:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f08dfd5eb566'
down_revision: str | Sequence[str] | None = '1dcbb2054c35'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('app_settings', sa.Column('anthropic_api_key', sa.Text(), nullable=True))
    op.add_column(
        'app_settings',
        sa.Column('ai_model', sa.String(length=64), nullable=False, server_default='claude-sonnet-5-5'),
    )


def downgrade() -> None:
    op.drop_column('app_settings', 'ai_model')
    op.drop_column('app_settings', 'anthropic_api_key')
