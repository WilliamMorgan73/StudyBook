"""The production entry point (what the desktop app runs): the API, the uploaded files and the built frontend,
all from one origin.

    python -m app.desktop --port 8765 --data-dir ~/.local/share/StudyBook --frontend-dist ../frontend/dist

The frontend talks to `/api/...` and `/uploads/...` with relative URLs, exactly as it does through the Vite
dev server's proxy, so it needs no configuration, there's no CORS, and `<a download>` links just work.
Development doesn't use this: it runs `uvicorn app.main:app` behind Vite.
"""

import argparse
import os
from pathlib import Path

from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

_DEFAULT_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class SinglePageApp(StaticFiles):
    """The built frontend. A path that isn't a file (`/modules/3`, a client-side route) gets `index.html`,
    so reloading or deep-linking any page works."""

    async def get_response(self, path: str, scope: Scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


def create_app(frontend_dist: Path):
    # Imported here, not at the top: `settings` reads DATA_DIR when first imported, and `main` sets it first.
    from fastapi import FastAPI

    from app.core.config import settings
    from app.main import app as api
    from app.main import lifespan

    if not (frontend_dist / "index.html").is_file():
        raise SystemExit(f"No built frontend at {frontend_dist} (run `pnpm build` in frontend/).")

    # The API's lifespan (schema setup) doesn't run for a mounted app, so the outer app runs it.
    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.mount("/api", api)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
    app.mount("/", SinglePageApp(directory=frontend_dist, html=True), name="frontend")
    return app


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run StudyBook (API + frontend) on one local port.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", type=Path, required=True, help="where the database, uploads and backups live")
    parser.add_argument("--frontend-dist", type=Path, default=_DEFAULT_FRONTEND_DIST)
    args = parser.parse_args(argv)

    data_dir = args.data_dir.expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    # Set explicitly (environment variables beat `.env`), so nothing else can redirect the data: a stray
    # `.env` in the working directory would otherwise fill in its own.
    os.environ["DATA_DIR"] = str(data_dir)
    os.environ["DATABASE_URL"] = f"sqlite:///{data_dir / 'studybook.db'}"
    os.environ["UPLOAD_DIR"] = str(data_dir / "uploads")
    os.environ["BACKUP_DIR"] = str(data_dir / "backups")

    import uvicorn

    uvicorn.run(create_app(args.frontend_dist.resolve()), host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
