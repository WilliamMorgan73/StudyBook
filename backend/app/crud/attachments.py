import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.models.enums import AttachmentKind

_EXTENSION_KIND = {
    ".pdf": AttachmentKind.pdf,
    ".ppt": AttachmentKind.pptx,
    ".pptx": AttachmentKind.pptx,
    ".mp4": AttachmentKind.video,
    ".mov": AttachmentKind.video,
    ".mp3": AttachmentKind.audio,
    ".wav": AttachmentKind.audio,
    ".m4a": AttachmentKind.audio,
    ".png": AttachmentKind.image,
    ".jpg": AttachmentKind.image,
    ".jpeg": AttachmentKind.image,
    ".gif": AttachmentKind.image,
    ".webp": AttachmentKind.image,
    # .svg stays `other`: served from our own origin, an uploaded SVG could run script.
}


def store_upload(file: UploadFile, subdir: str) -> tuple[AttachmentKind, str, str]:
    """Save an uploaded file under uploads/<subdir>/ with a UUID filename.

    Returns (kind, original filename, on-disk path) for building an Attachment row.
    """
    suffix = Path(file.filename or "").suffix.lower()
    kind = _EXTENSION_KIND.get(suffix, AttachmentKind.other)

    upload_dir = Path(settings.upload_dir) / subdir
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    dest = upload_dir / stored_name
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    return kind, file.filename or stored_name, str(dest)


def remove_stored_file(file_path: str) -> None:
    """Delete an Attachment's file, then its owner folder (uploads/<kind>/<id>/) once empty.

    A missing file is fine, and anything resolving outside the upload dir is left alone.
    """
    root = Path(settings.upload_dir).resolve()
    path = Path(file_path).resolve()
    if not path.is_relative_to(root) or path == root:
        return
    path.unlink(missing_ok=True)
    folder = path.parent
    if len(folder.relative_to(root).parts) >= 2:  # never the root or uploads/submodules itself
        try:
            folder.rmdir()
        except OSError:
            pass  # still holds other files
