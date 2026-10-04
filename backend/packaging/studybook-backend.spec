# PyInstaller spec for the backend the desktop app runs (`app/desktop.py`). Build it with
# `uv run python packaging/build.py`, which also copies in the built frontend.
#
# onedir, not onefile: onefile unpacks everything (~300 MB, mostly onnxruntime/numpy for markitdown's
# magika) to a temp folder on every launch, which makes startup slow.
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

backend = Path(SPECPATH).parent

datas = [
    # Alembic reads the migration scripts from disk. Code finds them at `parents[2]` of
    # app/core/migrate.py and app/services/backup.py, which is the bundle root.
    (str(backend / "alembic"), "alembic"),
    (str(backend / "alembic.ini"), "."),
]
binaries = []
hiddenimports = collect_submodules("uvicorn") + collect_submodules("app")

for package in ("magika", "markitdown"):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden
for package in ("pdfminer", "pptx"):
    datas += collect_data_files(package)

a = Analysis(
    [str(backend / "packaging" / "entry.py")],
    pathex=[str(backend)],
    datas=datas,
    binaries=binaries,
    hiddenimports=hiddenimports,
    excludes=["pytest", "ruff", "tkinter"],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="studybook-backend", console=True)
coll = COLLECT(exe, a.binaries, a.datas, name="studybook-backend")
