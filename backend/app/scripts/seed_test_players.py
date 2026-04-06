#\!/usr/bin/env python3
"""Seed fake players for gameplay testing — connects directly to PostgreSQL.

Creates N test player accounts (no email required) with a predictable
password via direct DB insert, then optionally creates a qualifier match.
Backend does NOT need to be running.

Usage:
    python scripts/seed_test_players.py [options]

Examples:
    # Create 64 players for Vong Loai (reads DB config from configs/.env)
    python scripts/seed_test_players.py --count 64

    # Create 64 players + create the qualifier match OC3_M_VL
    python scripts/seed_test_players.py --count 64 --create-match --match-code OC3_M_VL --match-name "Vong Loai Test"

    # Inside Docker/Podman app container (DB host is 'postgresql'):
    python scripts/seed_test_players.py --count 64 --create-match --match-code OC3_M_VL

    # Override DB connection directly
    python scripts/seed_test_players.py --db-url postgresql+asyncpg://user:pass@localhost:5432/oc3

Requirements (already in backend/app/requirements.txt):
    asyncpg, sqlalchemy, passlib[bcrypt], python-dotenv
"""

import argparse
import asyncio
import os
import sys
import uuid
from pathlib import Path

# -- Load .env so we can reuse the same DB settings --------------------------
_ENV_FILE = Path(__file__).parent.parent / "configs" / ".env"
if _ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE)
    except ImportError:
        pass  # dotenv optional; fall back to real env vars

try:
    from passlib.context import CryptContext
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
except ImportError as _e:
    print(f"Missing dependency: {_e}")
    print("Run this script from the backend virtualenv or inside the app container:")
    print("  podman exec -w /backend/app app python scripts/seed_test_players.py --count 64")
    sys.exit(1)


# -- Defaults ----------------------------------------------------------------

TEST_PASSWORD = "testpass1"
PLAYER_PREFIX = "OC_U_P03TST"   # OC_U_P03TST01 ... OC_U_P03TST64
MAX_PLAYERS   = 64

_pwd_ctx = CryptContext(schemes=["bcrypt"])


def _make_players(count: int) -> list[dict]:
    return [
        {
            "user_code": f"{PLAYER_PREFIX}{i:02d}",
            "user_name": f"Thi sinh {i:02d}",
        }
        for i in range(1, count + 1)
    ]


def _build_db_url() -> str:
    user     = os.environ.get("POSTGRES_DB_USER", "postgres")
    password = os.environ.get("POSTGRES_DB_PASSWORD", "")
    host     = os.environ.get("POSTGRES_DB_HOST", "localhost")
    port     = os.environ.get("POSTGRES_DB_PORT", "5432")
    name     = os.environ.get("POSTGRES_DB_NAME", "oc3")
    # When running on the host machine, map Docker service name -> localhost
    if host == "postgresql":
        host = "localhost"
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"


# -- Core SQL helpers ---------------------------------------------------------

async def upsert_player(session: AsyncSession, player: dict) -> str:
    """Insert player row if not exists. Returns 'created' | 'exists'."""
    row = (await session.execute(
        text("SELECT id FROM users WHERE user_code = :code"),
        {"code": player["user_code"]},
    )).fetchone()

    if row:
        return "exists"

    hashed = _pwd_ctx.hash(TEST_PASSWORD)
    await session.execute(
        text(
            "INSERT INTO users "
            "(id, user_code, user_name, hashed_password, role, is_deleted, created_at, updated_at) "
            "VALUES (:id, :code, :name, :pw, 'player', false, now(), now())"
        ),
        {
            "id": str(uuid.uuid4()),
            "code": player["user_code"],
            "name": player["user_name"],
            "pw": hashed,
        },
    )
    return "created"


async def ensure_match(
    session: AsyncSession,
    match_code: str,
    match_name: str,
) -> str:
    """Insert match if not exists. Returns 'created' | 'exists'."""
    row = (await session.execute(
        text("SELECT id FROM matches WHERE match_code = :code"),
        {"code": match_code},
    )).fetchone()

    if row:
        return "exists"

    await session.execute(
        text(
            "INSERT INTO matches "
            "(id, match_code, match_name, match_status, is_deleted, created_at, updated_at) "
            "VALUES (:id, :code, :name, 'setup', false, now(), now())"
        ),
        {"id": str(uuid.uuid4()), "code": match_code, "name": match_name},
    )
    return "created"


# -- Output ------------------------------------------------------------------

def print_summary(players: list[dict], match_code: str | None) -> None:
    width = 70
    print("\n" + "=" * width)
    print(f"  TEST PLAYERS READY  ({len(players)} players)")
    print("=" * width)
    # Show first 8 as sample
    sample = players[:8]
    print(f"  {'User code':<22} {'Name':<18} Password")
    print(f"  {'-'*20:<22} {'-'*16:<18} {'-'*10}")
    for p in sample:
        print(f"  {p['user_code']:<22} {p['user_name']:<18} {TEST_PASSWORD}")
    if len(players) > 8:
        print(f"  ... va {len(players) - 8} player(s) nua (cung password: {TEST_PASSWORD})")
    if match_code:
        print(f"\n  Match code : {match_code}")
        print(f"  Player URL : /player/vl/<match_code>/<player_code>")
    print(f"\n  Login format:  user_code / {TEST_PASSWORD}")
    print("=" * width + "\n")


# -- CLI ---------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed test players directly into PostgreSQL (no backend, no email)."
    )
    parser.add_argument(
        "--db-url", default=None,
        help="SQLAlchemy async DB URL. Defaults to reading POSTGRES_DB_* env vars / configs/.env"
    )
    parser.add_argument(
        "--count", type=int, default=4,
        help=f"Number of players to create (default: 4, max: {MAX_PLAYERS})"
    )
    parser.add_argument(
        "--match-code", default=None,
        help="Match code to create (e.g. OC3_M_VL)"
    )
    parser.add_argument(
        "--match-name", default="Vong Loai Test",
        help="Match name when using --create-match (default: 'Vong Loai Test')"
    )
    parser.add_argument(
        "--create-match", action="store_true",
        help="Create the match (requires --match-code)"
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    if args.count < 1 or args.count > MAX_PLAYERS:
        print(f"Error: --count must be between 1 and {MAX_PLAYERS}.")
        sys.exit(1)

    if args.create_match and not args.match_code:
        print("Error: --match-code is required with --create-match.")
        sys.exit(1)

    players = _make_players(args.count)
    db_url  = args.db_url or _build_db_url()

    engine        = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        async with session.begin():
            # -- 1. Upsert all players ---------------------------------------
            print(f"\nSeeding {args.count} player(s) ...")
            created_count = exists_count = 0
            for player in players:
                result = await upsert_player(session, player)
                if result == "created":
                    created_count += 1
                else:
                    exists_count += 1

            print(f"  Created: {created_count}   Already existed: {exists_count}")

            # -- 2. Create match (optional) ----------------------------------
            if args.create_match:
                print(f"\nEnsuring match '{args.match_code}' exists ...")
                result = await ensure_match(session, args.match_code, args.match_name)
                print(f"  Match '{args.match_code}': {result}")

    await engine.dispose()
    print_summary(players, args.match_code)


if __name__ == "__main__":
    asyncio.run(main())
