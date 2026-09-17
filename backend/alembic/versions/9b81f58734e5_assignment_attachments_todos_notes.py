"""assignment attachments, todos, notes

Revision ID: 9b81f58734e5
Revises: 877abf819579
Create Date: 2026-09-17 18:28:38.221680

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9b81f58734e5'
down_revision: str | Sequence[str] | None = '877abf819579'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'assignment_todos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('assignment_id', sa.Integer(), nullable=False),
        sa.Column('text', sa.String(length=300), nullable=False),
        sa.Column('done', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default='now()', nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.add_column('assignments', sa.Column('notes_markdown', sa.String(), nullable=True))
    op.execute("UPDATE assignments SET notes_markdown = '' WHERE notes_markdown IS NULL")
    op.alter_column('assignments', 'notes_markdown', nullable=False)

    op.add_column('attachments', sa.Column('assignment_id', sa.Integer(), nullable=True))
    op.alter_column('attachments', 'submodule_id', existing_type=sa.Integer(), nullable=True)
    op.create_foreign_key(
        'attachments_assignment_id_fkey', 'attachments', 'assignments', ['assignment_id'], ['id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('attachments_assignment_id_fkey', 'attachments', type_='foreignkey')
    op.alter_column('attachments', 'submodule_id', existing_type=sa.Integer(), nullable=False)
    op.drop_column('attachments', 'assignment_id')
    op.drop_column('assignments', 'notes_markdown')
    op.drop_table('assignment_todos')
