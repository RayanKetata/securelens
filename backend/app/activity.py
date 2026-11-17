"""Activity log helpers.

`record_activity` only adds the row to the session. Call it before the
route's own commit so the change and its log entry are saved together
(or not at all).
"""
import csv
import io
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
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


def purge_expired_activity(db: Session, retention_days: int) -> int:
    """Delete entries older than the retention period; 0 keeps all.

    Commits, and returns how many entries were removed.
    """
    if retention_days <= 0:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    removed = db.execute(
        delete(models.ActivityEvent).where(models.ActivityEvent.occurred_at < cutoff)
    ).rowcount
    db.commit()
    return removed


_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value) -> str:
    """Stop spreadsheet apps from running a cell as a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(_FORMULA_START) else text


def activity_csv(events) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "occurred_at_utc", "actor", "action", "summary", "client"])

    for event in events:
        occurred = event.occurred_at
        if occurred.tzinfo is None:
            occurred = occurred.replace(tzinfo=timezone.utc)
        writer.writerow([
            event.id,
            occurred.astimezone(timezone.utc).isoformat(timespec="seconds"),
            csv_safe(event.actor),
            csv_safe(event.action),
            csv_safe(event.summary),
            csv_safe(event.client),
        ])

    return buffer.getvalue()


def control_label(system: models.System, control: models.SystemControl) -> str:
    return f"{control.code} on \"{system.name}\""
