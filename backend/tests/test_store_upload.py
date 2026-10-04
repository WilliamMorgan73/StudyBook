import io

import pytest
from fastapi import UploadFile

from app.core.config import settings
from app.crud.attachments import store_upload
from app.models.enums import AttachmentKind


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    return tmp_path


@pytest.mark.parametrize(
    ("filename", "kind"),
    [
        ("diagram.png", AttachmentKind.image),
        ("Photo.JPG", AttachmentKind.image),
        ("anim.gif", AttachmentKind.image),
        ("shot.webp", AttachmentKind.image),
        ("lecture.pdf", AttachmentKind.pdf),
        ("vector.svg", AttachmentKind.other),
        ("notes.txt", AttachmentKind.other),
    ],
)
def test_kind_comes_from_the_extension(filename, kind):
    stored_kind, _, _ = store_upload(UploadFile(io.BytesIO(b"x"), filename=filename), "submodules/1")
    assert stored_kind == kind


def test_keeps_the_original_name_and_stores_under_a_uuid(upload_dir):
    _, original, path = store_upload(UploadFile(io.BytesIO(b"data"), filename="image.png"), "submodules/7")
    assert original == "image.png"
    assert path.startswith("submodules/7/")  # relative to the upload folder
    assert path.endswith(".png") and not path.endswith("/image.png")
    with open(upload_dir / path, "rb") as stored:
        assert stored.read() == b"data"
