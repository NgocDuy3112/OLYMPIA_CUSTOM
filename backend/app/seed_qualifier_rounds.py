#!/usr/bin/env python3
"""
seed_qualifier_rounds.py — Seed qualifier questions for Rounds 2-5.

Round 1 already exists (8 questions: OC3_Q_VL_1_01 .. OC3_Q_VL_1_08).
This script creates questions for:
  - Round 2: 4 questions (OC3_Q_VL_2_01 .. OC3_Q_VL_2_04)
  - Round 3: 2 questions (OC3_Q_VL_3_01 .. OC3_Q_VL_3_02)
  - Round 4: 2 questions (OC3_Q_VL_4_01 .. OC3_Q_VL_4_02)
  - Round 5 (backup): 8 questions (OC3_Q_VL_5_01 .. OC3_Q_VL_5_08)

Run inside the app container:
  podman exec -w /backend/app app python seed_qualifier_rounds.py
"""

import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

_ENV_FILE = Path(__file__).parent.parent / "configs" / ".env"
if _ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE)
    except ImportError:
        pass

try:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
except ImportError as e:
    print(f"Missing dependency: {e}")
    sys.exit(1)


MATCH_CODE = "OC3_M_VL"
Q_PREFIX = "OC3_Q_VL"

# ── Question data for Rounds 2-5 ────────────────────────────────────────────

ROUND_2_QUESTIONS = [
    {
        "code": f"{Q_PREFIX}_2_01",
        "content": "Sông nào dài nhất thế giới?",
        "answer": "B",
        "options": ["Amazon", "Sông Nile", "Trường Giang", "Mississippi", "Hoàng Hà", "Mê Kông"],
        "explanation": "Sông Nile dài khoảng 6.650 km, là sông dài nhất thế giới.",
    },
    {
        "code": f"{Q_PREFIX}_2_02",
        "content": "Ai là người phát minh ra bóng đèn điện?",
        "answer": "A",
        "options": ["Thomas Edison", "Nikola Tesla", "Alexander Bell", "Benjamin Franklin", "Michael Faraday", "James Watt"],
        "explanation": "Thomas Edison được công nhận là người phát minh bóng đèn điện thực dụng.",
    },
    {
        "code": f"{Q_PREFIX}_2_03",
        "content": "Nguyên tố hóa học nào có số hiệu nguyên tử bằng 1?",
        "answer": "C",
        "options": ["Helium", "Oxy", "Hydro", "Carbon", "Nitơ", "Neon"],
        "explanation": "Hydro (H) có số hiệu nguyên tử Z = 1.",
    },
    {
        "code": f"{Q_PREFIX}_2_04",
        "content": "Đại dương nào lớn nhất trên Trái Đất?",
        "answer": "D",
        "options": ["Đại Tây Dương", "Ấn Độ Dương", "Bắc Băng Dương", "Thái Bình Dương", "Nam Đại Dương", "Biển Đông"],
        "explanation": "Thái Bình Dương là đại dương lớn nhất, chiếm khoảng 1/3 bề mặt Trái Đất.",
    },
]

ROUND_3_QUESTIONS = [
    {
        "code": f"{Q_PREFIX}_3_01",
        "content": "Năm nào Việt Nam giành được độc lập?",
        "answer": "E",
        "options": ["1944", "1946", "1954", "1975", "1945", "1930"],
        "explanation": "Ngày 2/9/1945, Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập.",
    },
    {
        "code": f"{Q_PREFIX}_3_02",
        "content": "Công thức hóa học của nước là gì?",
        "answer": "A",
        "options": ["H₂O", "CO₂", "NaCl", "H₂SO₄", "NH₃", "O₂"],
        "explanation": "Nước có công thức H₂O (2 nguyên tử hydro, 1 nguyên tử oxy).",
    },
]

ROUND_4_QUESTIONS = [
    {
        "code": f"{Q_PREFIX}_4_01",
        "content": "Ai là tác giả của thuyết tương đối?",
        "answer": "B",
        "options": ["Isaac Newton", "Albert Einstein", "Stephen Hawking", "Niels Bohr", "Max Planck", "Richard Feynman"],
        "explanation": "Albert Einstein công bố thuyết tương đối hẹp (1905) và tổng quát (1915).",
    },
    {
        "code": f"{Q_PREFIX}_4_02",
        "content": "Đồng tiền chung châu Âu gọi là gì?",
        "answer": "F",
        "options": ["Dollar", "Pound", "Franc", "Yen", "Won", "Euro"],
        "explanation": "Euro (€) là đồng tiền chung của nhiều quốc gia thuộc Liên minh Châu Âu.",
    },
]

ROUND_5_QUESTIONS = [
    {
        "code": f"{Q_PREFIX}_5_01",
        "content": "Vitamin nào được tổng hợp khi da tiếp xúc với ánh nắng mặt trời?",
        "answer": "D",
        "options": ["Vitamin A", "Vitamin B12", "Vitamin C", "Vitamin D", "Vitamin E", "Vitamin K"],
        "explanation": "Vitamin D được tổng hợp qua da khi tiếp xúc với tia UV từ ánh nắng.",
    },
    {
        "code": f"{Q_PREFIX}_5_02",
        "content": "Thành phố nào được mệnh danh là 'Thành phố tình yêu'?",
        "answer": "C",
        "options": ["Venice", "Rome", "Paris", "Barcelona", "Vienna", "Prague"],
        "explanation": "Paris (Pháp) được mệnh danh là 'Thành phố tình yêu' (City of Love).",
    },
    {
        "code": f"{Q_PREFIX}_5_03",
        "content": "Loài động vật nào lớn nhất từng tồn tại trên Trái Đất?",
        "answer": "A",
        "options": ["Cá voi xanh", "Khủng long T-Rex", "Voi châu Phi", "Cá mập trắng", "Bạch tuộc khổng lồ", "Hươu cao cổ"],
        "explanation": "Cá voi xanh (Blue Whale) dài tới 30m, nặng ~150 tấn — lớn nhất mọi thời đại.",
    },
    {
        "code": f"{Q_PREFIX}_5_04",
        "content": "Trái Đất quay quanh Mặt Trời mất khoảng bao lâu?",
        "answer": "B",
        "options": ["30 ngày", "365 ngày", "180 ngày", "24 giờ", "12 tháng", "52 tuần"],
        "explanation": "Trái Đất mất khoảng 365,25 ngày để hoàn thành một vòng quay quanh Mặt Trời.",
    },
    {
        "code": f"{Q_PREFIX}_5_05",
        "content": "Kim cương được tạo thành chủ yếu từ nguyên tố nào?",
        "answer": "E",
        "options": ["Silicon", "Sắt", "Oxy", "Nhôm", "Carbon", "Hydro"],
        "explanation": "Kim cương là dạng thù hình tinh thể của carbon (C).",
    },
    {
        "code": f"{Q_PREFIX}_5_06",
        "content": "Quốc gia nào có dân số đông nhất thế giới (2024)?",
        "answer": "C",
        "options": ["Trung Quốc", "Mỹ", "Ấn Độ", "Indonesia", "Brazil", "Pakistan"],
        "explanation": "Ấn Độ đã vượt Trung Quốc trở thành quốc gia đông dân nhất năm 2023.",
    },
    {
        "code": f"{Q_PREFIX}_5_07",
        "content": "Ngôn ngữ lập trình nào do Guido van Rossum tạo ra?",
        "answer": "F",
        "options": ["Java", "C++", "JavaScript", "Ruby", "Go", "Python"],
        "explanation": "Python được Guido van Rossum tạo ra vào cuối những năm 1980.",
    },
    {
        "code": f"{Q_PREFIX}_5_08",
        "content": "Bức tranh 'Mona Lisa' được trưng bày ở bảo tàng nào?",
        "answer": "A",
        "options": ["Louvre", "British Museum", "Uffizi", "Metropolitan", "Prado", "Hermitage"],
        "explanation": "Mona Lisa của Leonardo da Vinci được trưng bày tại Bảo tàng Louvre, Paris.",
    },
]

ALL_EXTRA_QUESTIONS = ROUND_2_QUESTIONS + ROUND_3_QUESTIONS + ROUND_4_QUESTIONS + ROUND_5_QUESTIONS


def _build_db_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    user = os.environ.get("POSTGRES_DB_USER", "postgres")
    pw = os.environ.get("POSTGRES_DB_PASSWORD", "")
    host = os.environ.get("POSTGRES_DB_HOST", "postgresql")
    port = os.environ.get("POSTGRES_DB_PORT", "5432")
    name = os.environ.get("POSTGRES_DB_NAME", "oc3")
    return f"postgresql+asyncpg://{user}:{pw}@{host}:{port}/{name}"


async def seed():
    db_url = _build_db_url()
    engine = create_async_engine(db_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as s:
        async with s.begin():
            match_row = (await s.execute(text("SELECT id FROM matches WHERE match_code=:c"), {"c": MATCH_CODE})).fetchone()
            if not match_row:
                print(f"[!] Match {MATCH_CODE} not found. Run simulate_qualifier.py first.")
                await engine.dispose()
                return
            match_id = str(match_row[0])
            print(f"Match {MATCH_CODE} (id={match_id[:8]}...)")

            inserted = 0
            skipped = 0
            for q in ALL_EXTRA_QUESTIONS:
                exists = (await s.execute(text("SELECT id FROM questions WHERE question_code=:c"), {"c": q["code"]})).fetchone()
                if exists:
                    skipped += 1
                    continue
                await s.execute(
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
                inserted += 1

    await engine.dispose()
    print(f"Done: {inserted} inserted, {skipped} already exist")
    print(f"  Round 2: {len(ROUND_2_QUESTIONS)} questions")
    print(f"  Round 3: {len(ROUND_3_QUESTIONS)} questions")
    print(f"  Round 4: {len(ROUND_4_QUESTIONS)} questions")
    print(f"  Round 5: {len(ROUND_5_QUESTIONS)} questions")


if __name__ == "__main__":
    asyncio.run(seed())
