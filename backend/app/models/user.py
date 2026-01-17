import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Enum, CheckConstraint, DateTime, UUID
from sqlalchemy.orm import Mapped, mapped_column
from dependencies.postgresql_db import Base
from models import *



class RoleEnum(str, enum.Enum):
    guest = "guest"
    player = "player"
    admin = "admin"



def utcnow():
    return datetime.now(timezone.utc)



class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("user_code LIKE 'OC_U%'", name='check_user_code_starts_with_OC_U'),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    user_code: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    user_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(default=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleEnum] = mapped_column(Enum(RoleEnum), default=RoleEnum.player)