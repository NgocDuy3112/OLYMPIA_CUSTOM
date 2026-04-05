#!/usr/bin/env python3
"""
simulate_qualifier.py — Full end-to-end simulation of the Vòng Loại (Qualifier) flow.

Steps:
  1. Seed qualifier questions for Round 1 into DB (linked to OC3_M_VL)
  2. Create (or reuse) a test admin account
  3. Authenticate admin → get JWT
  4. Authenticate 20 test players → get JWTs
  5. Simulate each player submitting an answer (mix correct/wrong/no-answer)
  6. Admin calls POST /qualifier/calculate-scores for each question
  7. Print standings after each question + final standings after Round 1
  8. Admin calls POST /qualifier/end-round to see who advances

Run from repo root (backend venv or inside app container):
  podman exec -w /backend/app app python simulate_qualifier.py \\
    --db-url postgresql+asyncpg://postgres:password@postgresql:5432/oc3 \\
    --api-url http://localhost:8000

Requires: asyncpg, sqlalchemy, passlib, python-dotenv, httpx
"""

import argparse
import asyncio
import json
import os
import random
import sys
import uuid
from pathlib import Path

# -- Load configs/.env -------------------------------------------------------
_ENV_FILE = Path(__file__).parent.parent / "configs" / ".env"
if _ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE)
    except ImportError:
        pass

try:
    import httpx
    from passlib.context import CryptContext
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run inside the app container: podman exec -w /backend/app app python simulate_qualifier.py ...")
    sys.exit(1)


# -- Constants ---------------------------------------------------------------

MATCH_CODE    = "OC3_M_VL"
Q_PREFIX      = "OC3_Q_VL"
ROUND_NUMBER  = 1
N_QUESTIONS   = 8
N_PLAYERS     = 20    # subset of 64 seeded players to simulate

ADMIN_CODE    = "OC_U_ADMIN_TST"
ADMIN_NAME    = "Admin Test VL"
ADMIN_PW      = "admintest1"
PLAYER_PREFIX = "OC_U_P03TST"    # OC_U_P03TST01 ... OC_U_P03TST64
PLAYER_PW     = "testpass1"

_pwd_ctx = CryptContext(schemes=["bcrypt"])


# -- Sample question data (Round 1, 8 questions) ----------------------------

QUESTIONS_DATA = [
    {
        "code":    f"{Q_PREFIX}_1_01",
        "content": "Hành tinh nào lớn nhất trong Hệ Mặt Trời?",
        "answer":  "A",
        "options": ["Sao Mộc", "Sao Thổ", "Sao Thiên Vương", "Sao Hải Vương", "Sao Hỏa", "Trái Đất"],
        "explanation": "Sao Mộc (Jupiter) là hành tinh lớn nhất trong Hệ Mặt Trời.",
    },
    {
        "code":    f"{Q_PREFIX}_1_02",
        "content": "Nguyên tố hóa học nào có ký hiệu Au?",
        "answer":  "C",
        "options": ["Nhôm", "Bạc", "Vàng", "Đồng", "Sắt", "Chì"],
        "explanation": "Au là ký hiệu của Vàng (Gold) trong bảng tuần hoàn.",
    },
    {
        "code":    f"{Q_PREFIX}_1_03",
        "content": "Ai là tác giả của cuốn tiểu thuyết 'Truyện Kiều'?",
        "answer":  "B",
        "options": ["Nguyễn Du", "Nguyễn Du", "Tố Hữu", "Hồ Xuân Hương", "Nam Quốc Sơn Hà", "Nguyễn Trãi"],
        "explanation": "Truyện Kiều do đại thi hào Nguyễn Du sáng tác.",
    },
    {
        "code":    f"{Q_PREFIX}_1_04",
        "content": "Tốc độ ánh sáng trong chân không xấp xỉ bao nhiêu km/s?",
        "answer":  "D",
        "options": ["100.000", "200.000", "250.000", "300.000", "350.000", "400.000"],
        "explanation": "Tốc độ ánh sáng ≈ 299.792 km/s, làm tròn ~300.000 km/s.",
    },
    {
        "code":    f"{Q_PREFIX}_1_05",
        "content": "Quốc gia nào có diện tích lớn nhất thế giới?",
        "answer":  "A",
        "options": ["Nga", "Canada", "Trung Quốc", "Mỹ", "Brazil", "Úc"],
        "explanation": "Nga có diện tích ~17,1 triệu km² — lớn nhất thế giới.",
    },
    {
        "code":    f"{Q_PREFIX}_1_06",
        "content": "Ngọn núi nào cao nhất thế giới?",
        "answer":  "B",
        "options": ["K2", "Everest", "Kangchenjunga", "Lhotse", "Makalu", "Cho Oyu"],
        "explanation": "Đỉnh Everest cao 8.849 m — cao nhất thế giới.",
    },
    {
        "code":    f"{Q_PREFIX}_1_07",
        "content": "DNA là chữ viết tắt của cụm từ nào?",
        "answer":  "E",
        "options": [
            "Digital Nucleic Acid",
            "Deoxyribose Nucleotide Arrangement",
            "Dynamic Nucleic Antigen",
            "Deoxyribose Nucleic Acid",
            "Deoxyribonucleic Acid",
            "Di-Nucleic Acid",
        ],
        "explanation": "DNA = Deoxyribonucleic Acid (Axit deoxyribonucleic).",
    },
    {
        "code":    f"{Q_PREFIX}_1_08",
        "content": "Thủ đô của Nhật Bản là thành phố nào?",
        "answer":  "C",
        "options": ["Osaka", "Kyoto", "Tokyo", "Nagoya", "Sapporo", "Yokohama"],
        "explanation": "Tokyo là thủ đô của Nhật Bản.",
    },
]


# -- DB helpers --------------------------------------------------------------

def _build_db_url() -> str:
    user = os.environ.get("POSTGRES_DB_USER", "postgres")
    pw   = os.environ.get("POSTGRES_DB_PASSWORD", "")
    host = os.environ.get("POSTGRES_DB_HOST", "localhost")
    port = os.environ.get("POSTGRES_DB_PORT", "5432")
    name = os.environ.get("POSTGRES_DB_NAME", "oc3")
    if host == "postgresql":
        host = "localhost"
    return f"postgresql+asyncpg://{user}:{pw}@{host}:{port}/{name}"


async def setup_db(session: AsyncSession) -> None:
    """Insert admin user + qualifier questions (idempotent)."""

    # 1. Admin user
    row = (await session.execute(text("SELECT id FROM users WHERE user_code=:c"), {"c": ADMIN_CODE})).fetchone()
    if not row:
        await session.execute(
            text(
                "INSERT INTO users (id, user_code, user_name, hashed_password, role, is_deleted, created_at, updated_at) "
                "VALUES (:id,:code,:name,:pw,'admin',false,now(),now())"
            ),
            {"id": str(uuid.uuid4()), "code": ADMIN_CODE, "name": ADMIN_NAME, "pw": _pwd_ctx.hash(ADMIN_PW)},
        )
        print(f"  [DB] Created admin {ADMIN_CODE}")
    else:
        print(f"  [DB] Admin {ADMIN_CODE} already exists")

    # 2. Get match id
    match_row = (await session.execute(text("SELECT id FROM matches WHERE match_code=:c"), {"c": MATCH_CODE})).fetchone()
    if not match_row:
        match_id = str(uuid.uuid4())
        await session.execute(
            text(
                "INSERT INTO matches (id,match_code,match_name,match_status,is_deleted,created_at,updated_at) "
                "VALUES (:id,:code,:name,'setup',false,now(),now())"
            ),
            {"id": match_id, "code": MATCH_CODE, "name": "Vòng Loại Test"},
        )
        print(f"  [DB] Created match {MATCH_CODE}")
    else:
        match_id = str(match_row[0])
        print(f"  [DB] Match {MATCH_CODE} exists (id={match_id[:8]}...)")

    # 3. Qualifier questions
    inserted_q = 0
    for q in QUESTIONS_DATA:
        exists = (await session.execute(text("SELECT id FROM questions WHERE question_code=:c"), {"c": q["code"]})).fetchone()
        if not exists:
            await session.execute(
                text(
                    "INSERT INTO questions (id,question_code,content,answer,options,explanation,match_id,is_used,is_deleted,created_at,updated_at) "
                    "VALUES (:id,:code,:content,:answer,:options,:explanation,:match_id,false,false,now(),now())"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "code": q["code"],
                    "content": q["content"],
                    "answer": q["answer"],
                    "options": json.dumps(q["options"], ensure_ascii=False),
                    "explanation": q["explanation"],
                    "match_id": match_id,
                },
            )
            inserted_q += 1
    print(f"  [DB] Qualifier questions: {inserted_q} inserted, {len(QUESTIONS_DATA)-inserted_q} already exist")


# -- API helpers -------------------------------------------------------------

async def login(client: httpx.AsyncClient, api_url: str, user_code: str, password: str) -> str | None:
    """Login and return JWT token. Endpoint uses OAuth2 form (username=user_code)."""
    resp = await client.post(
        f"{api_url}/auth/login",
        data={"username": user_code, "password": password},
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    # login endpoint returns token at top-level (not wrapped in data.access_token)
    return data.get("access_token")


async def submit_answer(
    client: httpx.AsyncClient,
    api_url: str,
    token: str,
    player_code: str,
    question_code: str,
    answer_text: str | None,
    timestamp: float,
) -> bool:
    """POST /answers/ for a player. Returns True on success."""
    if answer_text is None:
        return True  # no answer = skip
    resp = await client.post(
        f"{api_url}/answers/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "user_code": player_code,
            "match_code": MATCH_CODE,
            "question_code": question_code,
            "answer_text": answer_text,
            "has_buzzed": False,
            "timestamp": round(timestamp, 3),
        },
    )
    return resp.status_code in (200, 201)


async def calculate_scores(
    client: httpx.AsyncClient,
    api_url: str,
    admin_token: str,
    question_code: str,
    correct_answer: str,
) -> dict | None:
    """POST /qualifier/calculate-scores. Returns result data or None."""
    resp = await client.post(
        f"{api_url}/qualifier/calculate-scores",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "match_code": MATCH_CODE,
            "question_code": question_code,
            "correct_answer": correct_answer,
            "round_number": ROUND_NUMBER,
        },
    )
    if resp.status_code != 200:
        print(f"    [!] calculate-scores failed: {resp.status_code} {resp.text[:200]}")
        return None
    return resp.json().get("data")


async def get_standings(client: httpx.AsyncClient, api_url: str, token: str) -> list[dict]:
    resp = await client.get(
        f"{api_url}/qualifier/standings/{MATCH_CODE}",
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code != 200:
        return []
    return resp.json().get("data", {}).get("standings", [])


async def end_round(client: httpx.AsyncClient, api_url: str, admin_token: str, advance_count: int = 16) -> dict | None:
    resp = await client.post(
        f"{api_url}/qualifier/end-round",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"match_code": MATCH_CODE, "round_number": ROUND_NUMBER, "advance_count": advance_count},
    )
    if resp.status_code != 200:
        print(f"  [!] end-round failed: {resp.status_code} {resp.text[:200]}")
        return None
    return resp.json().get("data")


# -- Pretty print ------------------------------------------------------------

def print_standings(standings: list[dict], top_n: int = 10) -> None:
    print(f"\n  {'Rank':<6} {'User code':<22} {'Name':<18} {'Score':>8} {'Correct':>8} {'AvgTime':>9}")
    print(f"  {'-'*5:<6} {'-'*20:<22} {'-'*16:<18} {'-'*7:>8} {'-'*7:>8} {'-'*8:>9}")
    for entry in standings[:top_n]:
        avg = f"{entry.get('avg_response_time', 0):.2f}s" if entry.get('avg_response_time') else "-"
        print(
            f"  {entry.get('rank','-'):<6} {entry.get('user_code',''):<22} "
            f"{entry.get('user_name','')[:16]:<18} {entry.get('total_score',0):>8} "
            f"{entry.get('correct_score',0):>8} {avg:>9}"
        )
    if len(standings) > top_n:
        print(f"  ... và {len(standings) - top_n} người nữa")


def print_section(title: str) -> None:
    width = 70
    print(f"\n{'='*width}")
    print(f"  {title}")
    print(f"{'='*width}")


# -- Main simulation ---------------------------------------------------------

async def run_simulation(db_url: str, api_url: str, advance_count: int) -> None:

    random.seed(42)  # reproducible

    # ── Phase 1: DB setup ───────────────────────────────────────────────────
    print_section("Phase 1 — Chuẩn bị DB: câu hỏi + admin")
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        async with session.begin():
            await setup_db(session)

    await engine.dispose()

    # ── Phase 2: Authenticate ───────────────────────────────────────────────
    print_section("Phase 2 — Xác thực Admin + Players")

    async with httpx.AsyncClient(timeout=30) as client:

        admin_token = await login(client, api_url, ADMIN_CODE, ADMIN_PW)
        if not admin_token:
            print(f"  [!] Cannot login admin {ADMIN_CODE} — abort.")
            return
        print(f"  Admin token: ...{admin_token[-12:]}")

        # Get tokens for first N_PLAYERS test players
        player_tokens: dict[str, str] = {}
        for i in range(1, N_PLAYERS + 1):
            code = f"{PLAYER_PREFIX}{i:02d}"
            tok = await login(client, api_url, code, PLAYER_PW)
            if tok:
                player_tokens[code] = tok
        print(f"  Players authenticated: {len(player_tokens)}/{N_PLAYERS}")

        if not player_tokens:
            print("  [!] No player tokens — check players seeded (run seed_test_players.py first).")
            return

        player_codes = list(player_tokens.keys())

        # ── Phase 3: Simulate Câu hỏi ───────────────────────────────────────
        print_section(f"Phase 3 — Mô phỏng {len(QUESTIONS_DATA)} câu hỏi (Round {ROUND_NUMBER})")

        for qi, q_data in enumerate(QUESTIONS_DATA, start=1):
            q_code   = q_data["code"]
            correct  = q_data["answer"]
            options  = ["A", "B", "C", "D", "E", "F"]

            print(f"\n  Câu {qi}: [{q_code}] {q_data['content'][:55]}...")
            print(f"  Đáp án đúng: {correct}")

            # Generate realistic answer distribution:
            # ~50% correct, ~35% wrong, ~15% no-answer
            answers: dict[str, str | None] = {}
            for code in player_codes:
                roll = random.random()
                if roll < 0.15:
                    answers[code] = None  # no answer
                elif roll < 0.65:
                    answers[code] = correct  # correct
                else:
                    # pick random wrong option
                    wrong = random.choice([o for o in options if o != correct])
                    answers[code] = wrong

            # Submit answers concurrently
            answered_count = correct_count = 0
            tasks = []
            for code, ans in answers.items():
                if ans is None:
                    continue
                ts = round(random.uniform(1.5, 9.8), 3)  # realistic response time
                tasks.append(
                    submit_answer(client, api_url, player_tokens[code], code, q_code, ans, ts)
                )
                answered_count += 1
                if ans == correct:
                    correct_count += 1

            results = await asyncio.gather(*tasks, return_exceptions=True)
            ok_count = sum(1 for r in results if r is True)
            print(f"  Submitted: {answered_count} answers ({correct_count} đúng, {answered_count-correct_count} sai, {len(player_codes)-answered_count} bỏ)")
            print(f"  API OK: {ok_count}/{len(tasks)}")

            # Admin calculates scores
            score_data = await calculate_scores(client, api_url, admin_token, q_code, correct)
            if score_data:
                print(
                    f"  Score calc: correct={score_data.get('correct_count',0)}, "
                    f"wrong={score_data.get('wrong_count',0)}"
                )

        # ── Phase 4: Show standings ──────────────────────────────────────────
        print_section("Phase 4 — Bảng xếp hạng sau Round 1")
        standings = await get_standings(client, api_url, admin_token)
        if standings:
            print_standings(standings, top_n=10)
            print(f"\n  (Tổng {len(standings)} thí sinh có điểm)")
        else:
            print("  [!] Không lấy được standings.")

        # ── Phase 5: End round ───────────────────────────────────────────────
        print_section(f"Phase 5 — Kết thúc Round {ROUND_NUMBER} (advance top {advance_count})")
        end_data = await end_round(client, api_url, admin_token, advance_count)
        if end_data:
            advanced  = end_data.get("passed",    [])   # API returns "passed"
            reserves  = end_data.get("reserved",  [])   # API returns "reserved"
            print(f"\n  Thí sinh ĐẠT ({len(advanced)}):")
            for p in advanced[:10]:
                print(f"    ✓ {p.get('user_code','')} — {p.get('user_name','')}")
            if len(advanced) > 10:
                print(f"    ... và {len(advanced)-10} người nữa")
            print(f"\n  Dự bị ({len(reserves)}):")
            for p in reserves[:5]:
                print(f"    ~ {p.get('user_code','')} — {p.get('user_name','')}")

    print_section("✓ Mô phỏng hoàn tất!")
    print(f"""
  Bạn có thể vào frontend để xem kết quả:
    Admin UI : http://localhost:5174/admin/vl  (login: {ADMIN_CODE} / {ADMIN_PW})
    Player UI: http://localhost:5174/player/vl/OC3_M_VL/OC_U_P03TST01
    Standings: http://localhost:8000/qualifier/standings/OC3_M_VL

  Match code   : {MATCH_CODE}
  Round        : {ROUND_NUMBER}
  Questions    : {len(QUESTIONS_DATA)}
  Players sim  : {N_PLAYERS}
""")


# -- CLI --------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate full Vong Loai qualifier flow.")
    parser.add_argument("--db-url",  default=None, help="SQLAlchemy async DB URL")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API base URL (default: http://localhost:8000)")
    parser.add_argument("--advance", type=int, default=16, help="How many players advance (default: 16)")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    db_url = args.db_url or _build_db_url()
    asyncio.run(run_simulation(db_url, args.api_url, args.advance))
