from datetime import datetime, timezone
import uuid

from sqlalchemy import Integer, Float, DateTime, Boolean, ForeignKey, UUID, String
from sqlalchemy.orm import Mapped, mapped_column

from dependencies.postgresql_db import Base


def utcnow():
    return datetime.now(timezone.utc)


class QualifierRecord(Base):
    """Stores per-question score entries for the Qualifier (Vòng Loại) phase.

    Unlike the main Record model, points here can be negative and are not
    required to be multiples of 5.
    """

    __tablename__ = "qualifier_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True, primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    points: Mapped[int] = mapped_column(Integer, nullable=False)
    response_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    chosen_option: Mapped[str | None] = mapped_column(String(length=1), nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Foreign keys
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), nullable=False, index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), nullable=False, index=True)
