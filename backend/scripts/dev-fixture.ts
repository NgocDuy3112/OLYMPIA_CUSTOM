/**
 * dev-fixture — a REAL match in the dev database, so the decks can be walked in a
 * browser.
 *
 * Why it exists: the frontend suites stub fetch, and the backend integration
 * tests build their matches in-process and tear them down. Neither leaves
 * something a person can open at localhost and click. This script writes the
 * smallest tournament that reaches a round: one operator, four PIN players, one
 * LIVE match with khởi động's question batches, and the `matchLive` row the
 * engine expects before a round starts.
 *
 * It is IDEMPOTENT: run it again and it replaces its own fixture (matched by
 * slug), never touching other data. `--clean` removes it and prints nothing else.
 *
 *   npx tsx --env-file=../configs/.env scripts/dev-fixture.ts
 *   npx tsx --env-file=../configs/.env scripts/dev-fixture.ts --session   (print a portal cookie)
 *   npx tsx --env-file=../configs/.env scripts/dev-fixture.ts --clean
 *
 * The round it arms is khởi động ONLY: phase 1 (six oral runs each) and phase 2
 * (twelve typed questions, five-second buzz windows). That is deliberate — it is
 * the round that exercises the most frontend surface (stopwatch, buzz, verdicts,
 * Về sảnh). Extending it to another round means adding that round's `roundConfigs`
 * entry and question batch, exactly as the integration tests do.
 */
import argon2 from "argon2";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, pool } from "../src/db/pool.js";
import {
    answers,
    matchLive,
    matchResults,
    matches,
    tournaments,
    users
} from "../src/db/schema/index.js";
import type { MatchQuestion } from "../src/game/contracts/index.js";

const SLUG = "fixture-cup";
const OPERATOR = { username: "fixture-op", password: "fixture-pass-2026", displayName: "Fixture Op" };
const PLAYERS = ["An", "Bình", "Chi", "Dũng"];
const JOIN_CODE = "FIX123";
const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const MATCH_ID = "22222222-2222-4222-8222-222222222222";

const clean = process.argv.includes("--clean");
/** Print a portal session cookie instead of rebuilding — the console needs MFA
 *  on the real login route, which no browser walk can pass unattended. */
const printSession = process.argv.includes("--session");

/** A khởi động question: oral runs are timed by the console; phase 2 is typed. */
function question(turnId: "phase1" | "phase2", position: number): MatchQuestion {
    return {
        _id: randomUUID(),
        roundId: "khoi-dong",
        turnId,
        position,
        mode: turnId === "phase1" ? "oral" : "text",
        kind: "TEXT",
        questionText: `Fixture ${turnId} ${position}: thủ đô của Việt Nam?`,
        media: null,
        timeLimit: null,
        points: 10,
        payload: {
            acceptedAnswers: ["Hà Nội"],
            normalize: { caseSensitive: false, trim: true, stripAccents: true }
        },
        sourceId: randomUUID()
    };
}

async function remove() {
    await db.delete(answers).where(eq(answers.matchId, MATCH_ID));
    await db.delete(matchResults).where(eq(matchResults.matchId, MATCH_ID));
    await db.delete(matchLive).where(eq(matchLive.matchId, MATCH_ID));
    await db.delete(matches).where(eq(matches.id, MATCH_ID));
    await db.delete(tournaments).where(eq(tournaments.slug, SLUG));
    const playerRows = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.displayName, PLAYERS));
    if (playerRows.length > 0) {
        await db.delete(users).where(inArray(users.id, playerRows.map((r) => r.id)));
    }
    await db.delete(users).where(eq(users.username, OPERATOR.username));
}

/** A portal session for the fixture operator, signed exactly like a real login. */
async function session() {
    const [operator] = await db
        .select({ id: users.id, role: users.role, tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.username, OPERATOR.username))
        .limit(1);
    if (!operator) throw new Error("no fixture operator — run the fixture first");

    // buildApp only to reach the JWT plugin; nothing listens.
    const { buildApp } = await import("../src/app.js");
    const { signToken } = await import("../src/lib/jwt.js");
    const app = await buildApp();
    await app.ready();
    const cookie = signToken(app, "PORTAL", {
        sub: operator.id,
        role: operator.role,
        tokenVersion: operator.tokenVersion
    });
    await app.close();
    console.log(`portal_session=${cookie}`);
}

async function main() {
    if (printSession) return session();

    // ── its own rows only: the fixture is replaceable, the rest of the DB is not
    await remove();
    if (clean) {
        console.log("fixture removed");
        return;
    }

    const [operator] = await db
        .insert(users)
        .values({
            role: "OPERATOR",
            username: OPERATOR.username,
            displayName: OPERATOR.displayName,
            passwordHash: await argon2.hash(OPERATOR.password),
            tokenVersion: 0
        })
        .returning();

    const playerRows = await db
        .insert(users)
        .values(
            PLAYERS.map((name, i) => ({
                role: "PLAYER" as const,
                email: `fixture-player-${i + 1}@example.com`,
                displayName: name,
                tokenVersion: 0
            }))
        )
        .returning();

    await db.insert(tournaments).values({
        id: TOURNAMENT_ID,
        ownerId: operator.id,
        visibility: "PUBLIC",
        slug: SLUG,
        name: "Fixture Cup",
        rounds: [{ id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" }],
        format: { competitorsPerMatch: PLAYERS.length },
        stages: [{ id: "s1", title: "Chung kết" }]
    });

    // six oral runs in phase 1, twelve typed questions in phase 2 — the engine
    // refuses any other count for this round
    const phase1 = [1, 2, 3, 4, 5, 6].map((n) => question("phase1", n));
    const phase2 = Array.from({ length: 12 }, (_, i) => question("phase2", i + 1));

    await db.insert(matches).values({
        id: MATCH_ID,
        tournamentId: TOURNAMENT_ID,
        stageId: "s1",
        slot: 1,
        scheduledAt: new Date(),
        label: "Fixture — Chung kết",
        status: "LIVE",
        joinCode: JOIN_CODE,
        players: playerRows.map((p, i) => ({ kind: "user" as const, userId: p.id, seed: i + 1 })),
        roundConfigs: {
            "khoi-dong": {
                allowedKinds: ["TEXT"],
                scoring: { template: "constant", points: 10 },
                turns: [
                    { id: "phase1", mode: "oral", delivery: "sequential" },
                    { id: "phase2", mode: "oral", delivery: "sequential", buzzWindowSeconds: 5 }
                ]
            }
        },
        questions: [...phase1, ...phase2]
    });

    // The engine's row: a LIVE match with no round started yet.
    await db.insert(matchLive).values({ matchId: MATCH_ID, version: 0, roundId: "khoi-dong", state: {} });

    console.log(`
fixture ready
─────────────
tournament   ${TOURNAMENT_ID}  (slug: ${SLUG})
match        ${MATCH_ID}       status LIVE, join code ${JOIN_CODE}
seats        ${PLAYERS.join(", ")}
questions    6 oral (phase 1) + 12 typed (phase 2), all khởi động

console      http://localhost:5173/tournaments/${TOURNAMENT_ID}/matches/${MATCH_ID}/stage
  sign in    http://localhost:5173/login   ${OPERATOR.username} / ${OPERATOR.password}
players      http://localhost:5175/join    code ${JOIN_CODE}, then pick a name
  deck       http://localhost:5175/s/${SLUG}/matches/${MATCH_ID}

session      npx tsx --env-file=../configs/.env scripts/dev-fixture.ts --session
             (the console needs MFA on /login; use this cookie instead)
remove       npx tsx --env-file=../configs/.env scripts/dev-fixture.ts --clean
`);
}

main()
    .then(() => pool.end())
    .catch(async (error) => {
        console.error(error);
        await pool.end();
        process.exitCode = 1;
    });
