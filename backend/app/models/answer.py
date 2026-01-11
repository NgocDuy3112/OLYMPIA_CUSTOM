from datetime import datetime, timezone
import uuid

from sqlalchemy import UUID, String, Boolean, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dependencies.postgresql_db import Base
from models import *


def utcnow():
    return datetime.now(timezone.utc)



class Answer(Base):
    """
    Answer ids are in the range 3400001 to 3499999.
    """
    __tablename__ = "answers"
    # Columns
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid6, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    answer_text: Mapped[str] = mapped_column(String, nullable=True)
    has_buzzed: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    timestamp: Mapped[float] = mapped_column(Numeric(6, 3), nullable=True)
    # Foreign Keys
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), nullable=False)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), nullable=False)
    # Relationships
    player: Mapped["User"] = relationship(back_populates='answers') # type: ignore
    match: Mapped["Match"] = relationship(back_populates='answers') # type: ignore
    question: Mapped["Question"] = relationship(back_populates='answers') # type: ignore