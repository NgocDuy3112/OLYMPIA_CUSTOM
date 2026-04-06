import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DB_URL = 'postgresql+asyncpg://postgres:password@postgresql:5432/oc3'
VALKEY_URL = 'valkey://user:0lympiaCust0m3!@valkey:6379'

MATCH_CODE = 'OC3_M_VL'
Q_CODES = [f'OC3_Q_VL_1_{i:02d}' for i in range(1, 9)]  # Round 1 questions

async def main():
    engine = create_async_engine(DB_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as s:
        async with s.begin():
            r1 = await s.execute(text("DELETE FROM qualifier_records WHERE match_id = (SELECT id FROM matches WHERE match_code=:mc)"), {"mc": MATCH_CODE})
            r2 = await s.execute(text("DELETE FROM qualifier_advancements WHERE match_id = (SELECT id FROM matches WHERE match_code=:mc)"), {"mc": MATCH_CODE})
            # Also clean submitted answers for qualifier questions (join via question_id)
            q_placeholders = ", ".join(f":q{i}" for i in range(len(Q_CODES)))
            params = {f"q{i}": code for i, code in enumerate(Q_CODES)}
            params["mc"] = MATCH_CODE
            r3 = await s.execute(
                text(f"""DELETE FROM answers WHERE question_id IN (
                    SELECT id FROM questions WHERE question_code IN ({q_placeholders})
                ) AND match_id = (SELECT id FROM matches WHERE match_code=:mc)"""),
                params,
            )
            print(f'DB Deleted: qualifier_records={r1.rowcount}, advancements={r2.rowcount}, answers={r3.rowcount}')
    await engine.dispose()

    # Clean Valkey answer cache keys for this match
    try:
        from valkey.asyncio import Valkey
        vk = Valkey.from_url(VALKEY_URL, decode_responses=True)
        cursor = 0
        deleted_keys = 0
        while True:
            cursor, keys = await vk.scan(cursor, match=f'answer:{MATCH_CODE}:*', count=100)
            if keys:
                await vk.delete(*keys)
                deleted_keys += len(keys)
            if cursor == 0:
                break
        # Also clear qualifier leaderboard keys
        leaderboard_keys = [
            f'qualifier_leaderboard:{MATCH_CODE}',
            f'qualifier_correct_score:{MATCH_CODE}',
            f'qualifier_response_time:{MATCH_CODE}',
            f'qualifier_response_count:{MATCH_CODE}',
        ]
        deleted_lb = await vk.delete(*leaderboard_keys)
        await vk.aclose()
        print(f'Valkey Deleted: answer_cache_keys={deleted_keys}, leaderboard_keys={deleted_lb}')
    except Exception as e:
        print(f'[!] Valkey cleanup failed (non-fatal): {e}')


asyncio.run(main())
