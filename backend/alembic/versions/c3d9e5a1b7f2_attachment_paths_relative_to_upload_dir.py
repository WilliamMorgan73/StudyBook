"""attachment file paths relative to the upload folder

`attachments.file_path` used to include the upload folder (`uploads/submodules/3/x.pdf`, the form the
URL was built from); it's now relative to it (`submodules/3/x.pdf`), so the data folder can live anywhere.

Revision ID: c3d9e5a1b7f2
Revises: 711f992b2d9e
Create Date: 2026-10-04 23:30:00.000000

"""

from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa

from alembic import op
from app.core.config import settings

revision: str = "c3d9e5a1b7f2"
down_revision: str | None = "711f992b2d9e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

attachments = sa.table("attachments", sa.column("id", sa.Integer), sa.column("file_path", sa.String))


def upgrade() -> None:
    connection = op.get_bind()
    upload_root = Path(settings.upload_dir).resolve()
    for row in connection.execute(sa.select(attachments.c.id, attachments.c.file_path)).all():
        resolved = Path(row.file_path).resolve()
        if resolved.is_relative_to(upload_root):
            relative = resolved.relative_to(upload_root).as_posix()
        elif row.file_path.startswith("uploads/"):  # written under a different upload folder setting
            relative = row.file_path.removeprefix("uploads/")
        else:
            continue
        connection.execute(attachments.update().where(attachments.c.id == row.id).values(file_path=relative))


def downgrade() -> None:
    connection = op.get_bind()
    for row in connection.execute(sa.select(attachments.c.id, attachments.c.file_path)).all():
        stored = str(Path(settings.upload_dir) / row.file_path)
        connection.execute(attachments.update().where(attachments.c.id == row.id).values(file_path=stored))
