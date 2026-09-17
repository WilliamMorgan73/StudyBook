"""rename notes to submodules

Revision ID: 877abf819579
Revises: 8f3ec74762a8
Create Date: 2026-09-17 18:15:13.651464

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '877abf819579'
down_revision: str | Sequence[str] | None = '8f3ec74762a8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.rename_table('notes', 'submodules')
    op.drop_constraint('notes_lecture_id_fkey', 'submodules', type_='foreignkey')
    op.drop_column('submodules', 'lecture_id')
    op.drop_column('submodules', 'is_quick_note')

    op.alter_column('attachments', 'note_id', new_column_name='submodule_id')
    op.alter_column('flashcards', 'note_id', new_column_name='submodule_id')


def downgrade() -> None:
    op.alter_column('flashcards', 'submodule_id', new_column_name='note_id')
    op.alter_column('attachments', 'submodule_id', new_column_name='note_id')

    op.add_column('submodules', sa.Column('is_quick_note', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('submodules', sa.Column('lecture_id', sa.Integer(), nullable=True))
    op.create_foreign_key('notes_lecture_id_fkey', 'submodules', 'lectures', ['lecture_id'], ['id'], ondelete='SET NULL')
    op.rename_table('submodules', 'notes')
