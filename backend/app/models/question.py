from datetime import datetime, timezone
import uuid
from sqlalchemy import CheckConstraint, String, DateTime, ForeignKey, Boolean, UUID, event, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dependencies.postgresql_db import Base


def utcnow():
    return datetime.now(timezone.utc)


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("question_code LIKE 'OC3_Q%'", name='check_question_code_starts_with_OC3_Q'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    question_code: Mapped[str] = mapped_column(String(length=15))
    content: Mapped[str] = mapped_column(String)
    answer: Mapped[str] = mapped_column(String)
    media_urls: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=True)
    explanation: Mapped[str] = mapped_column(String, nullable=True)
    
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Foreign Keys
    match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('matches.id'), nullable=False)