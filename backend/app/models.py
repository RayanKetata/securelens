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

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    control: Mapped["SystemControl"] = relationship(
        back_populates="evidence",
    )