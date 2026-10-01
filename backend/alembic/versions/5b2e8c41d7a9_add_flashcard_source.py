"""add flashcard source

Revision ID: 5b2e8c41d7a9
Revises: d4e7a1c9b302
Create Date: 2026-10-01 18:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5b2e8c41d7a9'
down_revision: str | Sequence[str] | None = 'd4e7a1c9b302'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'flashcards',
        sa.Column(
            'source',
            sa.Enum('manual', 'ai', name='flashcardsource', native_enum=False),
            server_default='manual',
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('flashcards', 'source')
