"""Activity log helpers.

`record_activity` only adds the row to the session. Call it before the
route's own commit so the change and its log entry are saved together
(or not at all).
"""
from sqlalchemy.orm import Session

from . import models


SUMMARY_LIMIT = 500


def record_activity(
    db: Session,
    actor: models.User | None,
    action: str,
    summary: str,
    *,
    actor_name: str | None = None,
    client: str = "",
) -> None:
    if len(summary) > SUMMARY_LIMIT:
        summary = summary[: SUMMARY_LIMIT - 1] + "…"

    db.add(
        models.ActivityEvent(
            actor_id=actor.id if actor is not None else None,
            actor=(actor.username if actor is not None else actor_name or "")[:80],
            action=action,
            summary=summary,
            client=client[:64],
        )
    )


def control_label(system: models.System, control: models.SystemControl) -> str:
    return f"{control.code} on \"{system.name}\""
