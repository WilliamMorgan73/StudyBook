"""add automatic backup settings to app_settings

On by default, existing installs included (server defaults).

Revision ID: d4e8f2a6c1b9
Revises: c3d9e5a1b7f2
Create Date: 2026-10-14 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4e8f2a6c1b9"
down_revision: str | None = "c3d9e5a1b7f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Plain ADD COLUMN (SQLite supports it with a constant default); no table rebuild needed.
    op.add_column("app_settings", sa.Column("auto_backup_enabled", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column("app_settings", sa.Column("auto_backup_interval_days", sa.Integer(), server_default="1", nullable=False))
    op.add_column("app_settings", sa.Column("auto_backup_keep", sa.Integer(), server_default="7", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("auto_backup_keep")
        batch_op.drop_column("auto_backup_interval_days")
        batch_op.drop_column("auto_backup_enabled")
