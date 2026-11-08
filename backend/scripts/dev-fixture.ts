import argon2 from "argon2";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, pool } from "../src/db/pool.js";
import {
    answers,
    matchLive,
    matchResults,
    matches,
    tournamentPlayers,
    tournaments,
    users
} from "../src/db/schema/index.js";
import { rotateRoomCode } from "../src/modules/match-codes/service.js";
import { pickUsername } from "../src/lib/username.js";
import type { MatchQuestion } from "../src/game/contracts/index.js";

const SLUG = "fixture-cup";
const OPERATOR = { username: "fixture-op", password: "fixture-pass-2026", displayName: "Fixture Op" };
const PLAYERS = ["An", "Bình", "Chi", "Dũng"];
const WALK_IN = 3;
const PLAYER_PASSWORD = "fixture-pass-2026";
const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const MATCH_ID = "22222222-2222-4222-8222-222222222222";

const clean = process.argv.includes("--clean");
const printSession = process.argv.includes("--session");

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
    const rostered = await db
        .select({ id: tournamentPlayers.userId })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, TOURNAMENT_ID));

    await db.delete(answers).where(eq(answers.matchId, MATCH_ID));
    await db.delete(matchResults).where(eq(matchResults.matchId, MATCH_ID));
    await db.delete(matchLive).where(eq(matchLive.matchId, MATCH_ID));
    await db.delete(matches).where(eq(matches.id, MATCH_ID));
    await db.delete(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, TOURNAMENT_ID));
    await db.delete(tournaments).where(eq(tournaments.slug, SLUG));
    const playerRows = [...rostered, ...(await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.displayName, PLAYERS)))];
    if (playerRows.length > 0) {
        await db.delete(users).where(inArray(users.id, playerRows.map((r) => r.id)));
    }
    await db.delete(users).where(eq(users.username, OPERATOR.username));
}

async function session() {
    const [operator] = await db
        .select({ id: users.id, role: users.role, tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.username, OPERATOR.username))
        .limit(1);
    if (!operator) throw new Error("no fixture operator — run the fixture first");

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

    const usernames: string[] = [];
    const playerValues = [];
    for (const [i, name] of PLAYERS.entries()) {
        usernames.push(await pickUsername(db, name));
        playerValues.push({
            role: "PLAYER" as const,
            username: usernames[i]!,
            email: `fixture-player-${i + 1}@example.com`,
            displayName: name,
            emailVerified: true,
            passwordHash: await argon2.hash(PLAYER_PASSWORD),
            mustChangePassword: true,
            tokenVersion: 0
        });
    }

    const playerRows = await db
        .insert(users)
        .values(playerValues)
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

    const phase1 = [1, 2, 3, 4, 5, 6].map((n) => question("phase1", n));
    const phase2 = Array.from({ length: 6 }, (_, i) => question("phase2", i + 1));

    await db.insert(matches).values({
        id: MATCH_ID,
        tournamentId: TOURNAMENT_ID,
        stageId: "s1",
        slot: 1,
        scheduledAt: new Date(),
        label: "Fixture — Chung kết",
        status: "LIVE",
        players: playerRows
            .slice(0, WALK_IN)
            .map((p, i) => ({ kind: "user" as const, userId: p.id, seed: i + 1 })),
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

    await db.insert(matchLive).values({ matchId: MATCH_ID, version: 0, roundId: "khoi-dong", state: {} });

    const room = await rotateRoomCode(TOURNAMENT_ID, MATCH_ID, operator.id);

    console.log(`
fixture ready
─────────────
tournament   ${TOURNAMENT_ID}  (slug: ${SLUG})
match        ${MATCH_ID}       status LIVE
seated       ${PLAYERS.slice(0, WALK_IN).join(", ")}
room code    ${room.code}      → http://localhost:5175/code
             (sign in as ${usernames[WALK_IN]} / ${PLAYER_PASSWORD} — first sign-in asks
              you to set your own password — then type the code: the 4th seat)
questions    6 oral (phase 1) + 6 typed (phase 2), all khởi động

console      http://localhost:5173/tournaments/${TOURNAMENT_ID}/matches/${MATCH_ID}/stage
  sign in    http://localhost:5173/login   ${OPERATOR.username} / ${OPERATOR.password}
players      http://localhost:5175/login   ${usernames.join(" / ")} · password ${PLAYER_PASSWORD}
             (username is the handle; the first sign-in swaps it for their own)
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
