"""add unique constraint on (match_id, question_code) in questions

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-04 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_questions_match_id_question_code",
        "questions",
        ["match_id", "question_code"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_questions_match_id_question_code",
        "questions",
        type_="unique",
    )
