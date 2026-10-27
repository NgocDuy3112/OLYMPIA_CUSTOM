// _review-setup.ts — ONE four-round LIVE match for reviewing the reshelled
// controller console (docs/ui-structure-plan.md, step 2).
//
// Reuses what already exists (checked before writing this):
//   · tournament  l4-playthrough  (rounds: khoi-dong, giai-ma, but-pha, ve-dich;
//                                  stage "l4"; roundRules saved → roundConfigs fallback;
//                                  roster: 4 players seated; slot 1 taken by FINISHED L4 Run)
//   · bank        the 5 non-THTH tags have EXACTLY 4 PUBLISHED TEXT rows each
//                 (= ve-dich's 20/30/40/50 board), plus 1 KEYWORD (round needs it)
// Flow: read bank ids + roster → close the pool → HTTP: create match with explicit
// entries (assembly copies them; ve-dich entries carry the board points) → PATCH
// LIVE → print the console URL and the portal session cookie for the browser.
//
//   cd backend && npx tsx --env-file=../configs/.env scripts/_review-setup.ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/pool.js";
import { questionBank, tournamentPlayers, tournaments, users } from "../src/db/schema/index.js";
import { buildApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";

const BASE = "http://localhost:3000";
const SLUG = "l4-playthrough";
const DOMAIN_TAGS = ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"];
const BOARD_POINTS = [20, 30, 40, 50]; // the deck's four rows

interface Entry {
    roundId: string;
    turnId: string;
    sourceId: string;
    points?: number;
}

let cookie = "";

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : null) as T;
}

async function main() {
    // ── db reads first (pool still alive) ────────────────────────────────────
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.slug, SLUG)).limit(1);
    if (!tournament) throw new Error(`tournament ${SLUG} not found`);

    const [admin] = await db.select().from(users).where(eq(users.role, "ADMIN")).limit(1);
    if (!admin) throw new Error("no ADMIN user — run `npm run seed:admin` first");

    const roster = await db
        .select({ id: users.id, tv: users.tokenVersion })
        .from(tournamentPlayers)
        .innerJoin(users, eq(tournamentPlayers.userId, users.id))
        .where(eq(tournamentPlayers.tournamentId, tournament.id))
        .limit(4);
    if (roster.length < 4) throw new Error(`only ${roster.length}/4 players in the roster`);

    // PUBLISHED ids of one kind/tag, shuffled so runs differ, limited.
    // Always constrained to the tournament's tags — the bank also holds DEMO rows
    // and assembly rejects questions whose tag is not in the tournament.
    const bankIds = async (kinds: string[], tag?: string, limit?: number): Promise<string[]> => {
        const conditions = [
            eq(questionBank.status, "PUBLISHED"),
            inArray(questionBank.kind, kinds as ("MC" | "TEXT" | "KEYWORD")[]),
            inArray(questionBank.tag, DOMAIN_TAGS),
        ];
        if (tag) conditions.push(eq(questionBank.tag, tag));
        const rows = await db
            .select({ id: questionBank.id })
            .from(questionBank)
            .where(and(...conditions))
            .orderBy(sql`random()`)
            .limit(limit ?? 999);
        return rows.map((r) => r.id);
    };

    // ── the 49 entries, mirroring the finished L4 Run's assembly ─────────────
    // khoi-dong 6 oral + 6 batch · giai-ma 8 hints + 1 keyword ·
    // but-pha 4 sprint · ve-dich 24 (6 tags × 20/30/40/50)
    const entries: Entry[] = [];

    for (const id of await bankIds(["MC", "TEXT"], undefined, 6)) {
        entries.push({ roundId: "khoi-dong", turnId: "phase1", sourceId: id });
    }
    for (const id of await bankIds(["MC", "TEXT"], undefined, 6)) {
        entries.push({ roundId: "khoi-dong", turnId: "phase2", sourceId: id });
    }
    for (const id of await bankIds(["TEXT", "KEYWORD"], undefined, 8)) {
        entries.push({ roundId: "giai-ma", turnId: "hints", sourceId: id });
    }
    const [keyword] = await bankIds(["KEYWORD"], undefined, 1);
    if (!keyword) throw new Error("no PUBLISHED KEYWORD question — giai-ma cannot finish without it");
    entries.push({ roundId: "giai-ma", turnId: "keyword", sourceId: keyword });

    for (const id of await bankIds(["TEXT"], undefined, 4)) {
        entries.push({ roundId: "but-pha", turnId: "sprint", sourceId: id });
    }

    // ve-dich: per tag, 4 TEXT rows = the deck's 20/30/40/50 cells.
    // The 5 non-THTH tags have exactly 4 each — they all go to the board.
    for (const tag of DOMAIN_TAGS) {
        const ids = await bankIds(["TEXT"], tag, 4);
        if (ids.length < 4) throw new Error(`tag ${tag}: only ${ids.length}/4 TEXT — board incomplete`);
        ids.forEach((id, i) =>
            entries.push({ roundId: "ve-dich", turnId: "phase1", sourceId: id, points: BOARD_POINTS[i] })
        );
    }
    console.log(
        `entries: ${entries.length} total, ve-dich board: ${entries.filter((e) => e.roundId === "ve-dich").length}`
    );

    // ── the portal session (token shape = _mint.ts; it IS the browser cookie) ─
    const app = await buildApp();
    await app.ready();
    const token = signToken(app, "PORTAL", {
        sub: admin.id,
        role: admin.role,
        tokenVersion: admin.tokenVersion,
    });
    await app.close();
    await db.$client.end(); // everything below goes over HTTP
    cookie = `portal_session=${token}`;

    // ── create (slot 1 is the finished L4 Run) ───────────────────────────────
    const match = await api<{ id: string }>(
        "POST",
        `/portal/tournaments/${tournament.id}/matches`,
        {
            kind: "STANDARD",
            stageId: "l4",
            slot: 2,
            label: "Controller review",
            scheduledAt: new Date(Date.now() + 60_000).toISOString(),
            players: roster.map((p, index) => ({ kind: "user", userId: p.id, seed: index + 1 })),
            questions: entries,
        }
    );
    console.log(`match ${match.id} assembled (${entries.length} questions)`);

    // ── LIVE: the console renders only on a LIVE match ───────────────────────
    await api("PATCH", `/portal/tournaments/${tournament.id}/matches/${match.id}/status`, {
        status: "LIVE",
    });
    console.log("match is LIVE");

    console.log("\n── review ──");
    console.log(`console URL : http://localhost:5174/tournaments/${tournament.id}/matches/${match.id}`);
    console.log(`portal cookie: portal_session=${token}`);
    process.exit(0);
}

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
