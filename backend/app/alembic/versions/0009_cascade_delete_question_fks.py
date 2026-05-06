"""add ON DELETE CASCADE to FK constraints referencing questions.id

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-06 00:00:00.000000
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _find_fk_name(conn, table: str, column: str, ref_table: str) -> str | None:
    """Query pg_constraint to find the actual FK constraint name."""
    result = conn.execute(sa.text("""
        SELECT conname FROM pg_constraint
        WHERE conrelid = :table::regclass
          AND contype = 'f'
          AND confrelid = :ref_table::regclass
          AND (
            SELECT attname FROM pg_attribute
            WHERE attrelid = conrelid AND attnum = conkey[1]
          ) = :column
    """), {"table": table, "ref_table": ref_table, "column": column})
    row = result.fetchone()
    return row[0] if row else None


def upgrade() -> None:
    conn = op.get_bind()
    for table in ("answers", "records", "qualifier_records"):
        name = _find_fk_name(conn, table, "question_id", "questions")
        if name:
            op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(
            f"fk_{table}_question_id_questions_id",
            table, "questions",
            ["question_id"], ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    for table in ("answers", "records", "qualifier_records"):
        op.drop_constraint(f"fk_{table}_question_id_questions_id", table, type_="foreignkey")
        op.create_foreign_key(
            f"{table}_question_id_fkey",
            table, "questions",
            ["question_id"], ["id"],
        )
