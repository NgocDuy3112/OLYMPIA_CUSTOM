"""add qualifier_records table and options column to questions

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add nullable options column to questions table (used by Qualifier questions)
    op.add_column(
        "questions",
        sa.Column("options", sa.String(), nullable=True),
    )

    # 2. Create qualifier_records table (no points % 5 constraint)
    op.create_table(
        "qualifier_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("response_time", sa.Float(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("chosen_option", sa.String(length=1), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=True),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("question_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"]),
        sa.ForeignKeyConstraint(["player_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_qualifier_records_id"), "qualifier_records", ["id"], unique=False)
    op.create_index(op.f("ix_qualifier_records_player_id"), "qualifier_records", ["player_id"], unique=False)
    op.create_index(op.f("ix_qualifier_records_match_id"), "qualifier_records", ["match_id"], unique=False)
    op.create_index(op.f("ix_qualifier_records_question_id"), "qualifier_records", ["question_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_qualifier_records_question_id"), table_name="qualifier_records")
    op.drop_index(op.f("ix_qualifier_records_match_id"), table_name="qualifier_records")
    op.drop_index(op.f("ix_qualifier_records_player_id"), table_name="qualifier_records")
    op.drop_index(op.f("ix_qualifier_records_id"), table_name="qualifier_records")
    op.drop_table("qualifier_records")
    op.drop_column("questions", "options")
