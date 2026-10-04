from logging.config import fileConfig

from sqlalchemy import engine_from_config, inspect, pool

import app.models  # noqa: F401 - populates Base.metadata with every model
from alembic import context
from app.core.config import settings
from app.core.database import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

# Interpret the config file for Python logging, unless the app is running migrations in-process
# (`app/core/migrate.py` passes its connection), where it would reset the app's own logging.
if config.config_file_name is not None and "connection" not in config.attributes:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database: the app's own connection when it runs them in-process
    (`app/core/migrate.py::ensure_schema`), else one from `settings.database_url` (the CLI)."""
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        if not inspect(connection).has_table("alembic_version"):
            # The migrations before SQLite were written for Postgres and can't build a schema from
            # scratch; a new database is created from the models and stamped instead.
            raise SystemExit(
                "This database has no schema yet. Start the app once (it creates the schema), "
                "then use alembic."
            )
        _run(connection)


def _run(connection) -> None:
    # Batch mode: SQLite can't ALTER most columns, so Alembic rebuilds the table instead.
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
