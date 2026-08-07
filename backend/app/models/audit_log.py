import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Enum, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column

from dependencies.postgresql_db import Base


def utcnow():
    return datetime.now(timezone.utc)


class AuditActionType(str, enum.Enum):
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    SCORE_CHANGE = "SCORE_CHANGE"
    MATCH_STATE_CHANGE = "MATCH_STATE_CHANGE"
    PLAYER_JOIN = "PLAYER_JOIN"
    PLAYER_LEAVE = "PLAYER_LEAVE"
    QUESTION_USED = "QUESTION_USED"
    MATCH_CREATED = "MATCH_CREATED"
    MATCH_DELETED = "MATCH_DELETED"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), default=uuid.uuid4, primary_key=True
    )
    action_type: Mapped[AuditActionType] = mapped_column(
        Enum(AuditActionType), nullable=False, index=True
    )
    actor_code: Mapped[str | None] = mapped_column(
        String(50), nullable=True, index=True
    )
    match_code: Mapped[str | None] = mapped_column(
        String(50), nullable=True, index=True
    )
    target_code: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    details: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
