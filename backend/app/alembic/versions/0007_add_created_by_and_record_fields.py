"""add created_by to matches and add fields to records

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add created_by column to matches table
    op.add_column(
        "matches",
        sa.Column("created_by", sa.UUID(), nullable=True),
    )
    op.create_index(op.f("ix_matches_created_by"), "matches", ["created_by"], unique=False)
    op.create_foreign_key(
        "fk_matches_created_by_users",
        "matches",
        "users",
        ["created_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # 2. Add round_number and question_code to records table
    op.add_column(
        "records",
        sa.Column("round_number", sa.Integer(), nullable=True),
    )
    op.add_column(
        "records",
        sa.Column("question_code", sa.String(length=25), nullable=True),
    )
    op.create_index(op.f("ix_records_round_number"), "records", ["round_number"], unique=False)
    op.create_index(op.f("ix_records_question_code"), "records", ["question_code"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_records_question_code"), table_name="records")
    op.drop_index(op.f("ix_records_round_number"), table_name="records")
    op.drop_column("records", "question_code")
    op.drop_column("records", "round_number")

    op.drop_constraint("fk_matches_created_by_users", "matches", type_="foreignkey")
    op.drop_index(op.f("ix_matches_created_by"), table_name="matches")
    op.drop_column("matches", "created_by")
