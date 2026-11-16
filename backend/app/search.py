"""Search across the extracted text and filenames of all evidence.

Matching is case-insensitive substring matching that works the same on
PostgreSQL and SQLite. Every term must appear (in the text or the
filename); "quoted phrases" are matched as a whole. Results are ranked
by how often the terms occur. This scans the evidence table, which is
fine for thousands of files; a full-text index would be the next step.
"""
import re

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from . import models


MAX_TERMS = 8
MIN_TERM_LENGTH = 2
# Matching rows considered for ranking; more than this is reported as
# "showing the best of the first N matches".
MAX_CANDIDATES = 200
SNIPPET_LENGTH = 240

_TOKENS = re.compile(r'"([^"]+)"|(\S+)')


def parse_terms(query: str) -> list[str]:
    terms = []
    for phrase, word in _TOKENS.findall(query):
        term = " ".join((phrase or word).lower().split())
        if len(term) >= MIN_TERM_LENGTH and term not in terms:
            terms.append(term)
    return terms[:MAX_TERMS]


def _like_pattern(term: str) -> str:
    escaped = (
        term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    )
    return f"%{escaped}%"


def _occurrences(haystack: str, term: str) -> int:
    return haystack.count(term)


def make_snippet(text: str, terms: list[str]) -> str:
    """A short excerpt around the first match, on one line."""
    flat = " ".join(text.split())
    lowered = flat.lower()
    positions = [lowered.find(term) for term in terms]
    positions = [position for position in positions if position >= 0]

    if not positions:
        start = 0
    else:
        start = max(0, min(positions) - SNIPPET_LENGTH // 3)
        # Start on a word boundary.
        if start > 0:
            space = flat.find(" ", start)
            if 0 <= space < min(positions):
                start = space + 1

    end = min(len(flat), start + SNIPPET_LENGTH)
    if end < len(flat):
        space = flat.rfind(" ", start, end)
        if space > start + SNIPPET_LENGTH // 2:
            end = space

    snippet = flat[start:end]
    if start > 0:
        snippet = "…" + snippet
    if end < len(flat):
        snippet += "…"
    return snippet


def search_evidence(
    db: Session,
    terms: list[str],
    system_id: int | None = None,
    limit: int = 20,
):
    """Return (results, truncated). Each result is a dict for the API."""
    text = func.lower(func.coalesce(models.Evidence.extracted_text, ""))
    name = func.lower(models.Evidence.original_filename)

    conditions = [
        or_(
            text.like(_like_pattern(term), escape="\\"),
            name.like(_like_pattern(term), escape="\\"),
        )
        for term in terms
    ]

    statement = (
        select(models.Evidence, models.SystemControl, models.System)
        .join(models.SystemControl, models.Evidence.system_control_id == models.SystemControl.id)
        .join(models.System, models.SystemControl.system_id == models.System.id)
        .where(and_(*conditions))
        .order_by(models.Evidence.uploaded_at.desc(), models.Evidence.id.desc())
        .limit(MAX_CANDIDATES + 1)
    )

    if system_id is not None:
        statement = statement.where(models.System.id == system_id)

    rows = db.execute(statement).all()
    truncated = len(rows) > MAX_CANDIDATES
    rows = rows[:MAX_CANDIDATES]

    ranked = []
    for evidence, control, system in rows:
        body = (evidence.extracted_text or "").lower()
        filename = evidence.original_filename.lower()
        in_text = sum(_occurrences(body, term) for term in terms)
        in_name = sum(1 for term in terms if term in filename)
        ranked.append((in_text + 5 * in_name, evidence, control, system, in_text))

    # Highest score first; ties keep the newest-first order.
    ranked.sort(key=lambda item: item[0], reverse=True)

    results = [
        {
            "id": evidence.id,
            "name": evidence.original_filename,
            "type": evidence.content_type,
            "uploadedAt": evidence.uploaded_at,
            "extractionMethod": evidence.extraction_method,
            "systemId": system.id,
            "systemName": system.name,
            "controlCode": control.code,
            "controlName": control.name,
            "matches": in_text,
            "snippet": make_snippet(evidence.extracted_text or "", terms)
            if in_text
            else "",
        }
        for _, evidence, control, system, in_text in ranked[:limit]
    ]

    return results, truncated
