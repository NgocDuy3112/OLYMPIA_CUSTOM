from datetime import datetime, timezone
import uuid

from sqlalchemy import UUID, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dependencies.postgresql_db import Base
from models import *


def utcnow():
    return datetime.now(timezone.utc)



class MatchPlayers(Base):
    """
    MatchPlayers ids are in the range 3200001 to 3299999.
    """
    __tablename__ = "match_players"
    __table_args__ = (
        UniqueConstraint('match_id', 'user_id', name='match_user_unique'),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid6, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True)
    player_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    match = relationship("Match", back_populates="match_players")
    player = relationship("User", back_populates="match_players")