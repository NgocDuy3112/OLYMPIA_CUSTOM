"""add new features: match_status, refresh_tokens, audit_logs

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-16 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Ensure matchstatusenum exists in a race-safe way, then add the column
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE matchstatusenum AS ENUM ('setup','active','completed','in_progress','paused','finished');
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END$$;
        """
    )

    op.add_column(
        "matches",
        sa.Column(
            "match_status",
            # use create_type=False to avoid attempting to recreate the type
            sa.Enum(
                "setup",
                "active",
                "completed",
                "in_progress",
                "paused",
                "finished",
                name="matchstatusenum",
                create_type=False,
            ),
            nullable=False,
            server_default="setup",
        ),
    )

    # 2. Create refresh_tokens table
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=True, default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_refresh_tokens_id"), "refresh_tokens", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_refresh_tokens_token"), "refresh_tokens", ["token"], unique=True
    )
    op.create_index(
        op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False
    )

        # Ensure auditactiontype enum exists in a race-safe way before creating the audit_logs table
        op.execute(
            """
            DO $$
            BEGIN
                CREATE TYPE auditactiontype AS ENUM ('LOGIN','LOGOUT','SCORE_CHANGE','MATCH_STATE_CHANGE','PLAYER_JOIN','PLAYER_LEAVE','QUESTION_USED','MATCH_CREATED','MATCH_DELETED');
            EXCEPTION WHEN duplicate_object THEN
                NULL;
            END$$;
            """
        )

    # 3. Create audit_logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "action_type",
            # ensure type exists first and avoid recreating it here
            sa.Enum(
                "LOGIN",
                "LOGOUT",
                "SCORE_CHANGE",
                "MATCH_STATE_CHANGE",
                "PLAYER_JOIN",
                "PLAYER_LEAVE",
                "QUESTION_USED",
                "MATCH_CREATED",
                "MATCH_DELETED",
                name="auditactiontype",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("actor_code", sa.String(length=50), nullable=True),
        sa.Column("match_code", sa.String(length=50), nullable=True),
        sa.Column("target_code", sa.String(length=50), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_audit_logs_id"), "audit_logs", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_audit_logs_action_type"), "audit_logs", ["action_type"], unique=False
    )
    op.create_index(
        op.f("ix_audit_logs_actor_code"), "audit_logs", ["actor_code"], unique=False
    )
    op.create_index(
        op.f("ix_audit_logs_match_code"), "audit_logs", ["match_code"], unique=False
    )
    op.create_index(
        op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"], unique=False
    )



def downgrade() -> None:
    op.drop_table("audit_logs")
    op.execute("DROP TYPE IF EXISTS auditactiontype")
    op.drop_table("refresh_tokens")
    op.drop_column("matches", "match_status")
    op.execute("DROP TYPE IF EXISTS matchstatusenum")
