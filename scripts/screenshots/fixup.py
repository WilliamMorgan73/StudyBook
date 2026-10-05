"""Direct database touches the API can't do, run after seed.py (with DATABASE_URL/UPLOAD_DIR pointing at the demo):
an AI summary for the eigenvalues topic (with the matching source hash, so it isn't flagged stale), plausible
created/updated dates (server `now()` defaults use the real clock, not the frozen one), and two eigenvalue cards
due again so the study screenshot has a card to show."""

import random
from datetime import datetime, timedelta

import app.models  # noqa
from app.core.database import engine
from app.models import Submodule
from app.services.submodule_source import gather_submodule_source
from app.services.submodule_summary import _cached_text, source_hash, summary_is_stale
from sqlalchemy import text
from sqlalchemy.orm import Session

SUMMARY = r"""- A nonzero **eigenvector** $v$ satisfies $Av = \lambda v$; $\lambda$ is its **eigenvalue**.
- Find eigenvalues by solving the characteristic equation $\det(A - \lambda I) = 0$, then each eigenvector from $(A - \lambda I)v = 0$.
- Sanity checks: $\operatorname{tr}(A) = \sum \lambda_i$ and $\det(A) = \prod \lambda_i$.
- $n$ independent eigenvectors $\Rightarrow A = PDP^{-1}$ (diagonalisable), which makes $A^k$ cheap."""

random.seed(4)
with Session(engine) as db:
    eigen = db.query(Submodule).filter_by(title="Eigenvalues & Eigenvectors").one()
    eigen.summary_markdown = SUMMARY
    eigen.summary_source_hash = source_hash(gather_submodule_source(eigen, extract=_cached_text))
    db.flush()
    sem = datetime(2026, 9, 21, 12)
    for table in ("modules", "quick_todos", "assignment_todos", "personal_events", "calendar_feeds"):
        db.execute(text(f"UPDATE {table} SET created_at = :t"), {"t": sem})
    for (sid,) in db.execute(text("SELECT id FROM submodules")).all():
        created = sem + timedelta(days=random.randint(7, 40))
        updated = datetime(2026, 11, 10, 9) + timedelta(days=random.randint(0, 8), hours=random.randint(0, 10))
        db.execute(text("UPDATE submodules SET created_at=:c, updated_at=:u WHERE id=:i"), {"c": created, "u": updated, "i": sid})
    db.execute(text("UPDATE attachments SET uploaded_at=:t"), {"t": datetime(2026, 11, 2, 16)})
    db.execute(
        text("UPDATE flashcards SET due_at=:t WHERE front LIKE 'Equation for the eigenvalues%' OR front LIKE 'Eigenvalues of%'"),
        {"t": datetime(2026, 11, 18, 9)},
    )
    db.commit()
    assert not summary_is_stale(db.get(Submodule, eigen.id)), "the demo summary should read as up to date"
