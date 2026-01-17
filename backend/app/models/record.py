from datetime import datetime, timezone
import uuid

from sqlalchemy import Integer, DateTime, Boolean, ForeignKey, CheckConstraint, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dependencies.postgresql_db import Base
from models import *


def utcnow():
    return datetime.now(timezone.utc)



class Record(Base):
    """
    SQLAlchemy model representing a record.
    Inherits from the common declarative Base.
    
    Record ids are in the range 3500001 to 3599999.
    """
    __tablename__ = "records"
    # Constraints
    __table_args__ = (
        CheckConstraint('points % 5 = 0', name='check_points_multiple_of_5'),
    )
    # Columns
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    points: Mapped[int] = mapped_column(Integer)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Foreign Keys
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id"), nullable=False)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), nullable=False)