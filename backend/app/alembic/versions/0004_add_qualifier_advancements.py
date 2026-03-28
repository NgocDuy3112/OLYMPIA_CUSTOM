"""add qualifier_advancements table

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "qualifier_advancements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=True),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"]),
        sa.ForeignKeyConstraint(["player_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_qualifier_advancements_id"), "qualifier_advancements", ["id"], unique=False)
    op.create_index(op.f("ix_qualifier_advancements_player_id"), "qualifier_advancements", ["player_id"], unique=False)
    op.create_index(op.f("ix_qualifier_advancements_match_id"), "qualifier_advancements", ["match_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_qualifier_advancements_match_id"), table_name="qualifier_advancements")
    op.drop_index(op.f("ix_qualifier_advancements_player_id"), table_name="qualifier_advancements")
    op.drop_index(op.f("ix_qualifier_advancements_id"), table_name="qualifier_advancements")
    op.drop_table("qualifier_advancements")
