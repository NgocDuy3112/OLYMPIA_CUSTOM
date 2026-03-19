"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### users ###
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("user_name", sa.String(length=100), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=True, default=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("guest", "player", "admin", name="roleenum"),
            nullable=True,
            default="player",
        ),
        sa.CheckConstraint(
            "user_code LIKE 'OC_U%'", name="check_user_code_starts_with_OC_U"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
        sa.UniqueConstraint("user_code"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(
        op.f("ix_users_user_code"), "users", ["user_code"], unique=True
    )

    # ### matches ###
    op.create_table(
        "matches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("match_code", sa.String(), nullable=True),
        sa.Column("match_name", sa.String(length=100), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=True, default=False),
        sa.CheckConstraint(
            "match_code LIKE 'OC3_M%'", name="check_match_code_starts_with_OC3_M"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
        sa.UniqueConstraint("match_code"),
        sa.UniqueConstraint("match_name"),
    )
    op.create_index(op.f("ix_matches_id"), "matches", ["id"], unique=False)
    op.create_index(
        op.f("ix_matches_match_code"), "matches", ["match_code"], unique=True
    )

    # ### match_player_positions ###
    op.create_table(
        "match_player_positions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "position >= 1 AND position <= 4", name="check_valid_position"
        ),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("match_id", "player_id", name="uq_match_player"),
        sa.UniqueConstraint("match_id", "position", name="uq_match_position"),
    )

    # ### questions ###
    op.create_table(
        "questions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("question_code", sa.String(length=25), nullable=True),
        sa.Column("content", sa.String(), nullable=True),
        sa.Column("answer", sa.String(), nullable=True),
        sa.Column("media_url", sa.String(), nullable=True),
        sa.Column("explanation", sa.String(), nullable=True),
        sa.Column("is_used", sa.Boolean(), nullable=True, default=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=True, default=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "question_code LIKE 'OC3_Q%'", name="check_question_code_starts_with_OC3_Q"
        ),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
    )
    op.create_index(op.f("ix_questions_id"), "questions", ["id"], unique=False)
    op.create_index(
        op.f("ix_questions_match_id"), "questions", ["match_id"], unique=False
    )

    # ### answers ###
    op.create_table(
        "answers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answer_text", sa.String(), nullable=True),
        sa.Column("has_buzzed", sa.Boolean(), nullable=True, default=False),
        sa.Column("timestamp", sa.Numeric(6, 3), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=True, default=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("question_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"]),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
    )
    op.create_index(op.f("ix_answers_id"), "answers", ["id"], unique=False)
    op.create_index(
        op.f("ix_answers_player_id"), "answers", ["player_id"], unique=False
    )
    op.create_index(
        op.f("ix_answers_match_id"), "answers", ["match_id"], unique=False
    )
    op.create_index(
        op.f("ix_answers_question_id"), "answers", ["question_id"], unique=False
    )

    # ### records ###
    op.create_table(
        "records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=True, default=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("question_id", sa.UUID(), nullable=False),
        sa.CheckConstraint("points % 5 = 0", name="check_points_multiple_of_5"),
        sa.ForeignKeyConstraint(["player_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"]),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
    )
    op.create_index(op.f("ix_records_id"), "records", ["id"], unique=False)
    op.create_index(
        op.f("ix_records_player_id"), "records", ["player_id"], unique=False
    )
    op.create_index(
        op.f("ix_records_match_id"), "records", ["match_id"], unique=False
    )
    op.create_index(
        op.f("ix_records_question_id"), "records", ["question_id"], unique=False
    )


def downgrade() -> None:
    op.drop_table("records")
    op.drop_table("answers")
    op.drop_table("questions")
    op.drop_table("match_player_positions")
    op.drop_table("matches")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS roleenum")
