"""add completed_at to modules

Revision ID: e7a3c9d5b2f1
Revises: d4e8f2a6c1b9
Create Date: 2026-10-14 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7a3c9d5b2f1"
down_revision: str | None = "d4e8f2a6c1b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("completed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    # Native DROP COLUMN (SQLite 3.35+), not a batch rebuild: dropping and recreating `modules`
    # with foreign keys on would cascade-delete everything that belongs to a module.
    op.drop_column("modules", "completed_at")
