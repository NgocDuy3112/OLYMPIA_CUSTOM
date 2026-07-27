from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "0001_analysis_indexes"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "idx_records_match_created",
        "records",
        ["match_id", "created_at"],
    )
    op.create_index(
        "idx_records_player_match",
        "records",
        ["player_id", "match_id"],
    )
    op.create_index(
        "idx_answers_match_question",
        "answers",
        ["match_id", "question_id", "created_at"],
    )
    op.create_index(
        "idx_answers_match_created",
        "answers",
        ["match_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_answers_match_created", table_name="answers")
    op.drop_index("idx_answers_match_question", table_name="answers")
    op.drop_index("idx_records_player_match", table_name="records")
    op.drop_index("idx_records_match_created", table_name="records")