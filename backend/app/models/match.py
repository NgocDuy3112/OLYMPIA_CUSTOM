from datetime import datetime, timezone
import uuid

from sqlalchemy import String, DateTime, Boolean, CheckConstraint, UUID, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dependencies.postgresql_db import Base
from models import *


def utcnow():
    return datetime.now(timezone.utc)



class Match(Base):
    """
    SQLAlchemy model representing a match in the system.
    This model defines the matches table with match_code starting with 'M'.
    
    Match ids are in the range 3100001 to 3199999.
    """
    __tablename__ = "matches"
    # Constraints
    __table_args__ = (
        CheckConstraint("match_code LIKE 'OC3_M%'", name='check_match_code_starts_with_OC3_M'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    match_code: Mapped[str] = mapped_column(String, unique=True, index=True)
    match_name: Mapped[str] = mapped_column(String(length=100), unique=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    players_position: Mapped[list["MatchPlayerPosition"]] = relationship("MatchPlayerPosition", back_populates="match", cascade="all, delete-orphan")


class MatchPlayerPosition(Base):
    """
    Mapping table to assign players to specific positions in a match.
    """
    __tablename__ = "match_player_positions"
    __table_args__ = (
        UniqueConstraint('match_id', 'position', name='uq_match_position'),
        UniqueConstraint('match_id', 'player_id', name='uq_match_player'),
        CheckConstraint('position >= 1 AND position <= 4', name='check_valid_position'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)
    player_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    match: Mapped["Match"] = relationship("Match", back_populates="players_position")
    user: Mapped["User"] = relationship("User")
