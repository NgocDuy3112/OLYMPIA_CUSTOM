from datetime import datetime, timezone
import uuid

from sqlalchemy import String, Integer, DateTime, Boolean, ForeignKey, UUID
from sqlalchemy.orm import Mapped, mapped_column

from dependencies.postgresql_db import Base


def utcnow():
    return datetime.now(timezone.utc)


class QualifierAdvancement(Base):

    __tablename__ = "qualifier_advancements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), nullable=False, index=True)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(length=16), nullable=False)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
