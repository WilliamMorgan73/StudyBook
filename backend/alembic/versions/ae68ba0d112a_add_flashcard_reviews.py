"""add flashcard reviews

Revision ID: ae68ba0d112a
Revises: 4d7bad042f9d
Create Date: 2026-10-01 11:43:10.530672

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'ae68ba0d112a'
down_revision: str | Sequence[str] | None = '4d7bad042f9d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'flashcard_reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('flashcard_id', sa.Integer(), nullable=False),
        sa.Column('quality', sa.Integer(), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['flashcard_id'], ['flashcards.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_flashcard_reviews_flashcard_id'), 'flashcard_reviews', ['flashcard_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_flashcard_reviews_flashcard_id'), table_name='flashcard_reviews')
    op.drop_table('flashcard_reviews')
