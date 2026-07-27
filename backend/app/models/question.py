from datetime import datetime, timezone
import uuid
from sqlalchemy import CheckConstraint, String, DateTime, ForeignKey, Boolean, UUID
from sqlalchemy.orm import Mapped, mapped_column

from dependencies.postgresql_db import Base
from configs import AppSettings
import json

_settings = AppSettings()
_QUESTION_PATTERN = _settings.QUESTION_PATTERN  # e.g. "OC3_Q"


def utcnow():
    return datetime.now(timezone.utc)


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint(
            f"question_code LIKE '{_QUESTION_PATTERN}%'",
            name='check_question_code_starts_with_season_prefix',
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    question_code: Mapped[str] = mapped_column(String(length=25))
    content: Mapped[str] = mapped_column(String)
    answer: Mapped[str] = mapped_column(String)
    # store single media URL (or comma-separated URLs) as a string
    media_url: Mapped[str] = mapped_column(String, nullable=True)
    explanation: Mapped[str] = mapped_column(String, nullable=True)
    # JSON-encoded list of 6 option strings for Qualifier questions, e.g. '["A text","B text",...]'
    options: Mapped[str | None] = mapped_column(String, nullable=True)
    
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Foreign Keys
    match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('matches.id'), nullable=False, index=True)

    # Backwards-compatible properties for older tests/code that expect individual
    # answer_a..answer_f fields and a 'correct_answer' field.
    @property
    def _options_list(self) -> list[str] | None:
        if not self.options:
            return None
        try:
            return json.loads(self.options)
        except Exception:
            # If options stored as a plain string, return None
            return None

    @property
    def answer_a(self) -> str | None:
        opts = self._options_list
        return opts[0] if opts and len(opts) > 0 else None

    @property
    def answer_b(self) -> str | None:
        opts = self._options_list
        return opts[1] if opts and len(opts) > 1 else None

    @property
    def answer_c(self) -> str | None:
        opts = self._options_list
        return opts[2] if opts and len(opts) > 2 else None

    @property
    def answer_d(self) -> str | None:
        opts = self._options_list
        return opts[3] if opts and len(opts) > 3 else None

    @property
    def answer_e(self) -> str | None:
        opts = self._options_list
        return opts[4] if opts and len(opts) > 4 else None

    @property
    def answer_f(self) -> str | None:
        opts = self._options_list
        return opts[5] if opts and len(opts) > 5 else None

    @property
    def correct_answer(self) -> str | None:
        # The stored `answer` field contains the correct option indicator (e.g., 'A')
        return self.answer

    def __init__(self, *args, **kwargs):
        """Allow construction with legacy fields answer_a..answer_f and correct_answer.
        If those are provided, convert them into the `options` JSON string and
        set the `answer` field to the provided correct_answer.
        """
        # Extract legacy answer fields if present
        answers = []
        for key in ('answer_a', 'answer_b', 'answer_c', 'answer_d', 'answer_e', 'answer_f'):
            if key in kwargs:
                val = kwargs.pop(key)
                if val is not None:
                    answers.append(val)

        correct = kwargs.pop('correct_answer', None)

        # If legacy answers were provided, encode them into options
        if answers:
            try:
                kwargs['options'] = json.dumps(answers, ensure_ascii=False)
            except Exception:
                kwargs['options'] = None

        # If correct_answer provided, map it to the 'answer' field
        if correct is not None:
            kwargs['answer'] = correct

        # Now set remaining attributes via SQLAlchemy's attribute system
        for k, v in kwargs.items():
            setattr(self, k, v)