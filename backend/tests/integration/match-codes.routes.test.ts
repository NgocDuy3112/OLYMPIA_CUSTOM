import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { auditEvents, matchCodes, matches, tournamentPlayers, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";


let app: FastifyInstance;
let ownerCookie: string;
let ownerId: string;
let strangerCookie: string;
let tournamentId: string;
const SLUG = "code-cup";

const portalAuth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

let ipTick = 0;
const perCallIp = () => `10.9.${Math.floor(ipTick / 200)}.${(ipTick++ % 200) + 1}`;

const DESK_PASSWORD = "mat-khau-ban-2026";
const OWN_PASSWORD = "mat-khau-cua-toi-1";

const sessionCookie = (res: { headers: Record<string, unknown> }) =>
    `gameplay_session=${(String(res.headers["set-cookie"] ?? "").split("gameplay_session=")[1] ?? "").split(";")[0]}`;

async function makePlayer(displayName: string): Promise<{ id: string; cookie: string }> {
    const created = await app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/players/new`,
        headers: portalAuth(ownerCookie),
        payload: { displayName, password: DESK_PASSWORD },
    });
    expect(created.statusCode).toBe(200);
    const { userId, username } = created.json() as { userId: string; username: string };

    const first = await app.inject({
        method: "POST",
        url: "/gameplay/auth/login",
        remoteAddress: perCallIp(),
        payload: { username, password: DESK_PASSWORD },
    });
    expect(first.statusCode).toBe(200);
    const cookie = sessionCookie(first);

    const changed = await app.inject({
        method: "POST",
        url: "/gameplay/auth/change-password",
        remoteAddress: perCallIp(),
        headers: { cookie },
        payload: { currentPassword: DESK_PASSWORD, newPassword: OWN_PASSWORD },
    });
    expect(changed.statusCode).toBe(200);

    return { id: userId, cookie: sessionCookie(changed) };
}

const claim = (code: string, cookie?: string) =>
    app.inject({
        method: "POST",
        url: "/gameplay/join/claim",
        remoteAddress: perCallIp(),
        ...(cookie ? { headers: { cookie } } : {}),
        payload: { code },
    });

const redeem = (code: string) =>
    app.inject({
        method: "POST",
        url: "/gameplay/auth/entry-code",
        remoteAddress: perCallIp(),
        payload: { code },
    });

const mintRoomCode = async (matchId: string, cookie = ownerCookie) => {
    const res = await app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/matches/${matchId}/code`,
        headers: portalAuth(cookie),
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { code: string }).code;
};

const makeMatch = async (label: string, seatUserIds: string[], status: "UPCOMING" | "LIVE" | "FINISHED" = "UPCOMING") => {
    const [match] = await db
        .insert(matches)
        .values({
            tournamentId,
            stageId: "s1",
            scheduledAt: new Date(),
            label,
            status,
            players: seatUserIds.map((userId, index) => ({ kind: "user" as const, userId, seed: index + 1 })),
            roundConfigs: {},
            questions: [],
        })
        .returning({ id: matches.id });
    return match!.id;
};

const seatsOf = async (matchId: string) => {
    const [row] = await db.select({ players: matches.players }).from(matches).where(eq(matches.id, matchId));
    return row!.players;
};

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db
        .insert(users)
        .values({ role: "OPERATOR", username: "code-owner", displayName: "Code Owner", tokenVersion: 0 })
        .returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner!.id, role: "OPERATOR", tokenVersion: 0 });
    ownerId = owner!.id;

    const [stranger] = await db
        .insert(users)
        .values({ role: "OPERATOR", username: "code-stranger", displayName: "Stranger", tokenVersion: 0 })
        .returning();
    strangerCookie = signToken(app, "PORTAL", { sub: stranger!.id, role: "OPERATOR", tokenVersion: 0 });

    const [tournament] = await db
        .insert(tournaments)
        .values({
            ownerId: owner!.id,
            visibility: "PUBLIC",
            slug: SLUG,
            name: "Code Cup",
            rounds: [{ id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }],
            format: { competitorsPerMatch: 4 },
            stages: [{ id: "s1", title: "Stage s1" }],
        })
        .returning();
    tournamentId = tournament!.id;
});

afterAll(async () => {
    await app.close();
});

describe("the room code — which room is open", () => {
    let openMatch: string;
    let lastSeatMatch: string;
    let fullMatch: string;
    let code: string;
    let playerA: { id: string; cookie: string };
    let playerB: { id: string; cookie: string };
    let playerC: { id: string; cookie: string };
    let playerD: { id: string; cookie: string };
    let playerE: { id: string; cookie: string };

    beforeAll(async () => {
        playerA = await makePlayer("Room A");
        playerB = await makePlayer("Room B");
        playerC = await makePlayer("Room C");
        playerD = await makePlayer("Room D");
        playerE = await makePlayer("Room E");

        openMatch = await makeMatch("Open table", [playerA.id]);
        lastSeatMatch = await makeMatch("One seat left", [playerA.id, playerB.id, playerC.id]);
        fullMatch = await makeMatch("Full table", [playerA.id, playerB.id, playerC.id, playerD.id]);
        code = await mintRoomCode(openMatch);
    });

    it("refuses a claim with no session: the code alone is never identity", async () => {
        const res = await claim(code);
        expect(res.statusCode).toBe(401);
        expect((await seatsOf(openMatch))).toHaveLength(1);
    });

    it("seats the signed-in player who types it, and names the match they won", async () => {
        const res = await claim(code, playerB.cookie);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ matchId: openMatch, slug: SLUG, label: "Open table" });

        const seats = await seatsOf(openMatch);
        expect(seats.map((seat) => seat.userId)).toEqual([playerA.id, playerB.id]);
        expect(seats[1]).toMatchObject({ kind: "user", seed: 2 });
    });

    it("is what \"Vào trận\" now opens — the seat is on the account", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/gameplay/me/match",
            headers: { cookie: playerB.cookie },
        });
        const items = (res.json() as { items: Array<{ matchId: string }> }).items;
        expect(items.map((item) => item.matchId)).toContain(openMatch);
    });

    it("answers the same 404 for an unknown code and an expired one", async () => {
        const unknown = await claim("ZZZZZZ", playerC.cookie);
        expect(unknown.statusCode).toBe(404);

        const expiredMatch = await makeMatch("Yesterday", []);
        await db.insert(matchCodes).values({
            code: "EXPIRD",
            matchId: expiredMatch,
            expiresAt: new Date(Date.now() - 1000),
        });
        const expired = await claim("EXPIRD", playerC.cookie);
        expect(expired.statusCode).toBe(404);

        const message = (res: { json: () => unknown }) => (res.json() as { message: string }).message;
        expect(message(expired)).toBe(message(unknown));
    });

    it("409s a full table — capacity is the real check", async () => {
        const fullCode = await mintRoomCode(fullMatch);
        const res = await claim(fullCode, playerE.cookie);
        expect(res.statusCode).toBe(409);
        expect((res.json() as { message: string }).message).toContain("đã đủ thí sinh");
        expect(await seatsOf(fullMatch)).toHaveLength(4);
    });

    it("lets a walk-in take the LAST seat, then refuses the next one", async () => {
        const tableCode = await mintRoomCode(lastSeatMatch);

        const takesIt = await claim(tableCode, playerD.cookie);
        expect(takesIt.statusCode).toBe(200);
        expect(await seatsOf(lastSeatMatch)).toHaveLength(4);

        const refused = await claim(tableCode, playerE.cookie);
        expect(refused.statusCode).toBe(409);
        expect(await seatsOf(lastSeatMatch)).toHaveLength(4);
    });

    it("is idempotent for the player already seated — a repeated tap changes nothing", async () => {
        const again = await claim(code, playerB.cookie);
        expect(again.statusCode).toBe(200);
        expect(await seatsOf(openMatch)).toHaveLength(2);
    });

    it("409s a finished match: no new code, and no entry under an old one", async () => {
        const finished = await makeMatch("Done", [playerA.id], "FINISHED");

        const mint = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/matches/${finished}/code`,
            headers: portalAuth(ownerCookie),
        });
        expect(mint.statusCode).toBe(409);

        await db.insert(matchCodes).values({
            code: "FINSHD",
            matchId: finished,
            expiresAt: new Date(Date.now() + 60_000),
        });
        const res = await claim("FINSHD", playerB.cookie);
        expect(res.statusCode).toBe(409);
        expect((res.json() as { message: string }).message).toContain("đã kết thúc");
    });
});


describe("rotation — a leaked code dies on the spot", () => {
    it("mints a new code, kills the old one, and leaves every seat untouched", async () => {
        const player = await makePlayer("Rotate");
        const matchId = await makeMatch("Rotate me", []);
        const before = await mintRoomCode(matchId);

        const seated = await claim(before, player.cookie);
        expect(seated.statusCode).toBe(200);
        const seatsBefore = await seatsOf(matchId);

        const rotated = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/matches/${matchId}/code`,
            headers: portalAuth(ownerCookie),
        });
        expect(rotated.statusCode).toBe(200);
        const after = (rotated.json() as { code: string }).code;
        expect(after).not.toBe(before);

        const dead = await claim(before, player.cookie);
        expect(dead.statusCode).toBe(404);

        expect(await seatsOf(matchId)).toEqual(seatsBefore);

        const alive = await claim(after, player.cookie);
        expect(alive.statusCode).toBe(200);
    });

    it("is refused to a stranger and shown only to the tournament's staff", async () => {
        const matchId = await makeMatch("Staff only", []);
        await mintRoomCode(matchId);

        const strangerMint = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/matches/${matchId}/code`,
            headers: portalAuth(strangerCookie),
        });
        expect(strangerMint.statusCode).toBe(403);

        const strangerRead = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${tournamentId}/match-codes`,
            headers: portalAuth(strangerCookie),
        });
        expect(strangerRead.statusCode).toBe(403);

        const list = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${tournamentId}/match-codes`,
            headers: portalAuth(ownerCookie),
        });
        expect(list.statusCode).toBe(200);
        const items = (list.json() as { items: Array<{ matchId: string; code: string; expiresAt: string }> }).items;
        const mine = items.find((item) => item.matchId === matchId);
        expect(mine?.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
        expect(mine?.expiresAt).toBeTruthy();
    });

    it("404s a match that belongs to another tournament", async () => {
        const [other] = await db
            .insert(tournaments)
            .values({
                ownerId,
                visibility: "PUBLIC",
                slug: "other-cup",
                name: "Other Cup",
                rounds: [{ id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }],
                format: { competitorsPerMatch: 4 },
                stages: [{ id: "s1", title: "Stage s1" }],
            })
            .returning({ id: tournaments.id });

        const matchId = await makeMatch("Belongs elsewhere", []);
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${other!.id}/matches/${matchId}/code`,
            headers: portalAuth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });

    it("records the rotation without writing down the code", async () => {
        const matchId = await makeMatch("Audited rotate", []);
        await mintRoomCode(matchId);
        const rotated = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/matches/${matchId}/code`,
            headers: portalAuth(ownerCookie),
        });
        const code = (rotated.json() as { code: string }).code;

        const events = await db
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.action, "tournament_updated"));
        const rotation = events.find(
            (event) => (event.details as { roomCodeRotated?: string } | null)?.roomCodeRotated === matchId
        );
        expect(rotation).toBeTruthy();
        expect(JSON.stringify(rotation!.details)).not.toContain(code);
    });
});

describe("the console takes a seat back", () => {
    it("ejects a walk-in from an UPCOMING match", async () => {
        const player = await makePlayer("Eject Me");
        const matchId = await makeMatch("Ejectable", [player.id]);

        const res = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${tournamentId}/matches/${matchId}/players/${player.id}`,
            headers: portalAuth(ownerCookie),
        });
        expect(res.statusCode).toBe(204);
        expect(await seatsOf(matchId)).toHaveLength(0);
    });

    it("404s a seat nobody holds, and refuses a match already under way", async () => {
        const player = await makePlayer("Eject Two");
        const matchId = await makeMatch("Not seated", []);

        const missing = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${tournamentId}/matches/${matchId}/players/${player.id}`,
            headers: portalAuth(ownerCookie),
        });
        expect(missing.statusCode).toBe(404);

        const live = await makeMatch("Under way", [player.id], "LIVE");
        const tooLate = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${tournamentId}/matches/${live}/players/${player.id}`,
            headers: portalAuth(ownerCookie),
        });
        expect(tooLate.statusCode).toBe(409);
        expect(await seatsOf(live)).toHaveLength(1);
    });

    it("is refused to a stranger", async () => {
        const player = await makePlayer("Eject Three");
        const matchId = await makeMatch("Stranger eject", [player.id]);

        const res = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${tournamentId}/matches/${matchId}/players/${player.id}`,
            headers: portalAuth(strangerCookie),
        });
        expect(res.statusCode).toBe(403);
        expect(await seatsOf(matchId)).toHaveLength(1);
    });
});

describe("the seat claim lands on the record", () => {
    it("audits who claimed, without the code they typed", async () => {
        const player = await makePlayer("Claimed");
        const matchId = await makeMatch("Audited claim", []);
        const code = await mintRoomCode(matchId);

        const res = await claim(code, player.cookie);
        expect(res.statusCode).toBe(200);

        const events = await db.select().from(auditEvents).where(eq(auditEvents.action, "tournament_updated"));
        const claimEvent = events.find(
            (event) => (event.details as { seatClaimed?: string } | null)?.seatClaimed === player.id
            && event.matchId === matchId
        );
        expect(claimEvent).toBeTruthy();
        expect(JSON.stringify(claimEvent!.details)).not.toContain(code);
    });
});

describe("the walk-in's whole path — the done-when, end to end", () => {
    it("is created by the desk, sets their own password, and reaches the deck with the code", async () => {
        const created = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/players/new`,
            headers: portalAuth(ownerCookie),
            payload: { displayName: "Vào Sàn", password: DESK_PASSWORD },
        });
        expect(created.statusCode).toBe(200);
        const { username } = created.json() as { userId: string; username: string };
        expect(username).toBe("vao-san");

        const first = await app.inject({
            method: "POST",
            url: "/gameplay/auth/login",
            remoteAddress: perCallIp(),
            payload: { username, password: DESK_PASSWORD },
        });
        expect(first.statusCode).toBe(200);
        const deskCookie = sessionCookie(first);

        const blocked = await app.inject({
            method: "GET",
            url: "/gameplay/me/match",
            headers: { cookie: deskCookie },
        });
        expect(blocked.statusCode).toBe(409);
        expect((blocked.json() as { error: string }).error).toBe("PASSWORD_CHANGE_REQUIRED");

        const changed = await app.inject({
            method: "POST",
            url: "/gameplay/auth/change-password",
            remoteAddress: perCallIp(),
            headers: { cookie: deskCookie },
            payload: { currentPassword: DESK_PASSWORD, newPassword: OWN_PASSWORD },
        });
        expect(changed.statusCode).toBe(200);
        const cookie = sessionCookie(changed);

        const matchId = await makeMatch("Walk-in table", []);
        const code = await mintRoomCode(matchId);
        const seated = await claim(code, cookie);
        expect(seated.statusCode).toBe(200);
        expect(seated.json()).toMatchObject({ matchId, slug: SLUG });

        const mine = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: { cookie } });
        const items = (mine.json() as { items: Array<{ matchId: string }> }).items;
        expect(items.map((item) => item.matchId)).toContain(matchId);

        const stale = await app.inject({
            method: "GET",
            url: "/gameplay/me/match",
            headers: { cookie: deskCookie },
        });
        expect(stale.statusCode).toBe(401);
    });
});
