from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class System(Base):
    __tablename__ = "systems"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    owner: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    environment: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="Not Started",
        nullable=False,
    )

    progress: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    risk: Mapped[str] = mapped_column(
        String(50),
        default="Not Assessed",
        nullable=False,
    )

    controls: Mapped[list["SystemControl"]] = relationship(
        back_populates="system",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SystemControl.id",
    )


class SystemControl(Base):
    __tablename__ = "system_controls"

    __table_args__ = (
        UniqueConstraint(
            "system_id",
            "code",
            name="uq_system_control_code",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    system_id: Mapped[int] = mapped_column(
        ForeignKey(
            "systems.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    family: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="Not Assessed",
        nullable=False,
    )

    analyst_notes: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    findings: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    system: Mapped["System"] = relationship(
        back_populates="controls",
    )

    evidence: Mapped[list["Evidence"]] = relationship(
        back_populates="control",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Evidence.id",
    )

    history: Mapped[list["AssessmentHistory"]] = relationship(
        back_populates="control",
        cascade="all, delete-orphan",
        order_by="AssessmentHistory.id",
    )


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    system_control_id: Mapped[int] = mapped_column(
        ForeignKey(
            "system_controls.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    stored_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
    )

    content_type: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    
    extracted_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    extraction_status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        nullable=False,
    )

    # "text", "ocr", "text+ocr", or None when no text was found.
    extraction_method: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    # Caveats such as pages OCR could not read.
    extraction_note: Mapped[str] = mapped_column(
        String(200),
        default="",
        server_default="",
        nullable=False,
    )

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    control: Mapped["SystemControl"] = relationship(
        back_populates="evidence",
    )


class AssessmentHistory(Base):
    """One saved analyst decision. Rows are append-only."""

    __tablename__ = "assessment_history"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    system_control_id: Mapped[int] = mapped_column(
        ForeignKey(
            "system_controls.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    previous_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    new_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    analyst_notes: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    findings: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Username is copied so history stays readable if the user is deleted.
    changed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    changed_by: Mapped[str] = mapped_column(
        String(80),
        default="",
        nullable=False,
    )

    control: Mapped["SystemControl"] = relationship(
        back_populates="history",
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    username: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        unique=True,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # admin | analyst | viewer
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="analyst",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Authenticator-app secret (base32). Set only once MFA is turned on.
    mfa_secret: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    # Secret shown during setup, waiting for the first valid code.
    mfa_pending_secret: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    # Last accepted 30-second step, so a code cannot be replayed.
    mfa_last_step: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # JSON list of SHA-256 hashes of unused recovery codes.
    mfa_recovery_codes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

    @property
    def mfa_enabled(self) -> bool:
        return bool(self.mfa_secret)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # SHA-256 of the bearer token; the token itself is never stored.
    token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    user: Mapped["User"] = relationship(
        back_populates="sessions",
    )


class ActivityEvent(Base):
    """Append-only record of who did what. Never updated or deleted by the API."""

    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Username is copied so the log stays readable if the user is deleted.
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    actor: Mapped[str] = mapped_column(
        String(80),
        default="",
        nullable=False,
    )

    # Dotted category, for example "auth.login" or "system.delete".
    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )

    summary: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    # Client address; recorded for sign-in related events only.
    client: Mapped[str] = mapped_column(
        String(64),
        default="",
        nullable=False,
    )
