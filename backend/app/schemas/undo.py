from pydantic import BaseModel


class DeleteResult(BaseModel):
    """What a delete returns: the token that undoes it, for a short while (see app/services/undo.py)."""

    undo_token: str
