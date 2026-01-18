from datetime import datetime, timezone
import uuid

from sqlalchemy import UUID, String, Boolean, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dependencies.postgresql_db import Base
from models import *


def utcnow():
    return datetime.now(timezone.utc)



class Answer(Base):
    __tablename__ = "answers"
    # Columns
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    answer_text: Mapped[str] = mapped_column(String, nullable=True)
    has_buzzed: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    timestamp: Mapped[float] = mapped_column(Numeric(6, 3), nullable=True)
    # Foreign Keys
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), nullable=False)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), nullable=False)