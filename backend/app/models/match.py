from datetime import datetime, timezone
import uuid

from sqlalchemy import String, DateTime, Boolean, CheckConstraint, UUID, event, select
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
        CheckConstraint("match_code LIKE 'OC_M%'", name='check_match_code_starts_with_OC_M'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid6, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    match_code: Mapped[str] = mapped_column(String(length=10), unique=True, index=True)
    match_name: Mapped[str] = mapped_column(String(length=100), unique=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    questions: Mapped[list["Question"]] = relationship("Question", back_populates="match") # type: ignore
    records: Mapped[list["Record"]] = relationship("Record", back_populates="match") # type: ignore
    players: Mapped[list["User"]] = relationship("User", secondary="records", back_populates="matches") # type: ignore