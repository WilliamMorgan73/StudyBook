"""Build the backend the desktop app bundles: PyInstaller (packaging/studybook-backend.spec) into
frontend/src-tauri/resources/backend/, plus the built frontend into frontend/src-tauri/resources/frontend/.

Run by Tauri's `beforeBuildCommand` (after `pnpm build`), so `pnpm tauri build` builds everything:

    uv run --project ../backend python ../backend/packaging/build.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
FRONTEND = BACKEND.parent / "frontend"
RESOURCES = FRONTEND / "src-tauri" / "resources"


def main() -> None:
    dist = FRONTEND / "dist"
    if not (dist / "index.html").is_file():
        sys.exit("frontend/dist is missing: run `pnpm build` first.")

    shutil.rmtree(RESOURCES, ignore_errors=True)
    subprocess.run(
        [
            sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
            "--distpath", str(RESOURCES),
            "--workpath", str(BACKEND / "build" / "pyinstaller"),
            str(BACKEND / "packaging" / "studybook-backend.spec"),
        ],
        check=True,
        cwd=BACKEND,
    )
    (RESOURCES / "studybook-backend").rename(RESOURCES / "backend")
    shutil.copytree(dist, RESOURCES / "frontend")
    print(f"Desktop backend and frontend ready in {RESOURCES}")


if __name__ == "__main__":
    main()
