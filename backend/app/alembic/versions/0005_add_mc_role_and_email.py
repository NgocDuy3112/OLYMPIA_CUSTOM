"""add mc role and email column to users

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add new 'mc' value to the PostgreSQL native enum type.
    #    ADD VALUE is not transactional in PostgreSQL, so it must run outside a transaction.
    op.execute("ALTER TYPE roleenum ADD VALUE IF NOT EXISTS 'mc'")

    # 2. Add nullable email column to users table.
    op.add_column(
        "users",
        sa.Column("email", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    # 2. Drop email column.
    op.drop_column("users", "email")

    # 1. PostgreSQL does not support removing enum values directly.
    #    To fully revert, you would need to recreate the enum without 'mc'.
    #    Left as a comment; handle manually if a full rollback is required.
    # op.execute("... recreate roleenum without 'mc' ...")
