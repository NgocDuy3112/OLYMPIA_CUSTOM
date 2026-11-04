import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { auditEvents, matchCodes, matches, tournamentPlayers, tournaments, users } from "../../src/db/schema/index.js";
import { signToken, signVerifyEmail } from "../../src/lib/jwt.js";

// Room codes and one-time entry codes — the PIN returns, demoted.
//
// The rule under test: THE CODE SAYS WHICH ROOM, THE ACCOUNT SAYS WHO YOU ARE.
// A claim needs BOTH (session + code), an entry code names ONE account and
// dies on use, and neither ever mints an identity the way the deleted /join
// claim did. Rotation and expiry are the reasons this is a table and not a
// column: a leaked code must stop working without touching a seat.

let app: FastifyInstance;
let ownerCookie: string;
let ownerId: string;
let strangerCookie: string;
let tournamentId: string;
const SLUG = "code-cup";

const portalAuth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

/**
 * The rate-limited routes count per IP, and every inject defaults to the same
 * one — each call gets its own address so the limit under test is the route's
 * own behaviour, not this file's traffic.
 */
let ipTick = 0;
const perCallIp = () => `10.9.${Math.floor(ipTick / 200)}.${(ipTick++ % 200) + 1}`;

const register = (email: string, displayName: string) =>
    app.inject({
        method: "POST",
        url: "/gameplay/auth/register",
        remoteAddress: perCallIp(),
        payload: { email, password: "mat-khau-42", displayName },
    });

/** Registered AND mail-linked — the precondition of every account action here. */
async function registerVerified(email: string, displayName: string): Promise<{ id: string; cookie: string }> {
    const res = await register(email, displayName);
    expect(res.statusCode).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.email, email));
    const verified = await app.inject({
        method: "GET",
        url: `/gameplay/auth/verify?token=${signVerifyEmail(app, row!.id)}`,
    });
    expect(verified.statusCode).toBe(302);

    const login = await app.inject({
        method: "POST",
        url: "/gameplay/auth/login",
        remoteAddress: perCallIp(),
        payload: { email, password: "mat-khau-42" },
    });
    expect(login.statusCode).toBe(200);
    const raw = String(login.headers["set-cookie"]).split("gameplay_session=")[1]?.split(";")[0] ?? "";
    return { id: row!.id, cookie: `gameplay_session=${raw}` };
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
        playerA = await registerVerified("room-a@example.test", "Room A");
        playerB = await registerVerified("room-b@example.test", "Room B");
        playerC = await registerVerified("room-c@example.test", "Room C");
        playerD = await registerVerified("room-d@example.test", "Room D");
        playerE = await registerVerified("room-e@example.test", "Room E");

        openMatch = await makeMatch("Open table", [playerA.id]);
        lastSeatMatch = await makeMatch("One seat left", [playerA.id, playerB.id, playerC.id]);
        fullMatch = await makeMatch("Full table", [playerA.id, playerB.id, playerC.id, playerD.id]);
        code = await mintRoomCode(openMatch);
    });

    it("refuses a claim with no session: the code alone is never identity", async () => {
        const res = await claim(code);
        expect(res.statusCode).toBe(401);
        // and the seat did not move
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

    it("answers the same 404 for an unknown code, an expired one, and an entry code", async () => {
        const unknown = await claim("ZZZZZZ", playerC.cookie);
        expect(unknown.statusCode).toBe(404);

        // Expired: the row exists, the clock says no.
        const expiredMatch = await makeMatch("Yesterday", []);
        await db.insert(matchCodes).values({
            code: "EXPIRD",
            matchId: expiredMatch,
            userId: null,
            expiresAt: new Date(Date.now() - 1000),
        });
        const expired = await claim("EXPIRD", playerC.cookie);
        expect(expired.statusCode).toBe(404);

        // An entry code answers a claim the same way: it is not a door.
        const entry = await issueEntryCodeDirect(playerC.id);
        const asRoom = await claim(entry, playerC.cookie);
        expect(asRoom.statusCode).toBe(404);

        const message = (res: { json: () => unknown }) => (res.json() as { message: string }).message;
        expect(message(expired)).toBe(message(unknown));
        expect(message(asRoom)).toBe(message(unknown));
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

        // 409, not a half-written seat: the two claims were serialised.
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

        // A code minted while the match was still open still says no.
        await db.insert(matchCodes).values({
            code: "FINSHD",
            matchId: finished,
            userId: null,
            expiresAt: new Date(Date.now() + 60_000),
        });
        const res = await claim("FINSHD", playerB.cookie);
        expect(res.statusCode).toBe(409);
        expect((res.json() as { message: string }).message).toContain("đã kết thúc");
    });
});

/** A live entry code, minted straight into the table (the roster route is tested in roster.routes.test.ts). */
async function issueEntryCodeDirect(userId: string): Promise<string> {
    const { issueEntryCode } = await import("../../src/modules/match-codes/service.js");
    const issued = await issueEntryCode(userId, ownerId);
    return issued.code;
}

describe("rotation — a leaked code dies on the spot", () => {
    it("mints a new code, kills the old one, and leaves every seat untouched", async () => {
        const player = await registerVerified("rotate@example.test", "Rotate");
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

        // The player who already sat down keeps their seat: rotation is about
        // the CODE, never about the match.
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
        // The tournament id is part of the lookup: pairing this desk's own
        // tournament with a match id seen elsewhere must not mint anything.
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

describe("the one-time entry code — the desk never holds a password", () => {
    let player: { id: string; cookie: string };

    beforeAll(async () => {
        player = await registerVerified("entry@example.test", "Entry Player");
    });

    const issue = async (userId: string, cookie = ownerCookie) => {
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/players/${userId}/entry-code`,
            headers: portalAuth(cookie),
        });
        return res;
    };

    it("turns into the player's OWN session — the same cookie a login mints", async () => {
        const enrolled = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/players`,
            headers: portalAuth(ownerCookie),
            payload: { userIds: [player.id] },
        });
        expect(enrolled.statusCode).toBe(200);

        const issued = await issue(player.id);
        expect(issued.statusCode).toBe(200);
        const { code } = issued.json() as { code: string };
        expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

        const redeemed = await redeem(code);
        expect(redeemed.statusCode).toBe(200);
        expect((redeemed.json() as { displayName: string }).displayName).toBe("Entry Player");
        expect(String(redeemed.headers["set-cookie"])).toContain("gameplay_session=");

        const me = await app.inject({
            method: "GET",
            url: "/gameplay/auth/me",
            headers: { cookie: String(redeemed.headers["set-cookie"]).split(";")[0] },
        });
        expect(me.statusCode).toBe(200);
        expect((me.json() as { displayName: string }).displayName).toBe("Entry Player");
    });

    it("is single use: the second attempt finds nothing, like a wrong code", async () => {
        const issued = await issue(player.id);
        const { code } = issued.json() as { code: string };

        expect((await redeem(code)).statusCode).toBe(200);
        const again = await redeem(code);
        expect(again.statusCode).toBe(404);

        const wrong = await redeem("ZZZZZZ");
        expect((again.json() as { message: string }).message).toBe((wrong.json() as { message: string }).message);
    });

    it("expires: an entry code older than 15 minutes is gone", async () => {
        await db.insert(matchCodes).values({
            code: "OLDENT",
            userId: player.id,
            matchId: null,
            expiresAt: new Date(Date.now() - 1000),
        });
        expect((await redeem("OLDENT")).statusCode).toBe(404);
    });

    it("refuses an account that is not activated yet — «Xác thực» comes first", async () => {
        const unverified = await register("unverified-entry@example.test", "Chưa xác thực");
        expect(unverified.statusCode).toBe(200);
        const [row] = await db.select().from(users).where(eq(users.email, "unverified-entry@example.test"));
        await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/players`,
            headers: portalAuth(ownerCookie),
            payload: { userIds: [row!.id] },
        });

        const res = await issue(row!.id);
        expect(res.statusCode).toBe(403);
        expect((res.json() as { message: string }).message).toContain("Xác thực");
    });

    it("never writes the code into the audit trail", async () => {
        const issued = await issue(player.id);
        const { code } = issued.json() as { code: string };

        const events = await db.select().from(auditEvents).where(eq(auditEvents.action, "tournament_updated"));
        const trail = events.filter(
            (event) => (event.details as { entryCodeFor?: string } | null)?.entryCodeFor === player.id
        );
        expect(trail.length).toBeGreaterThan(0);
        expect(JSON.stringify(trail)).not.toContain(code);
    });

    it("is refused for a stranger's cookie and for somebody not on the roster", async () => {
        const stranger = await issue(player.id, strangerCookie);
        expect(stranger.statusCode).toBe(403);

        const bystander = await registerVerified("bystander@example.test", "Bystander");
        const notEnrolled = await issue(bystander.id);
        expect(notEnrolled.statusCode).toBe(403);
        expect((notEnrolled.json() as { error: string }).error).toBe("NOT_ENROLLED");
    });
});

describe("the console takes a seat back", () => {
    it("ejects a walk-in from an UPCOMING match", async () => {
        const player = await registerVerified("eject@example.test", "Eject Me");
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
        const player = await registerVerified("eject-2@example.test", "Eject Two");
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
        const player = await registerVerified("eject-3@example.test", "Eject Three");
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
        const player = await registerVerified("claimed@example.test", "Claimed");
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
    it("registers at the venue, is activated by the desk, and reaches the deck with the code", async () => {
        const email = "walk-in@example.test";

        // 1. The player registers THEIR OWN account. No mail is opened: on a
        //    floor without SMTP the link may never arrive.
        expect((await register(email, "Vào Sàn")).statusCode).toBe(200);
        const [player] = await db.select().from(users).where(eq(users.email, email));
        expect(player.emailVerified).toBe(false);

        // 2. The desk enrolls the ADDRESS — no password exists to know.
        const enrolled = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/players`,
            headers: portalAuth(ownerCookie),
            payload: { userIds: [player.id] },
        });
        expect(enrolled.statusCode).toBe(200);

        // 3. …and activates it from the roster: the mail link is a convenience,
        //    not a gate (the account cannot log in until this click).
        const activated = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/players/${player.id}/verify`,
            headers: portalAuth(ownerCookie),
        });
        expect(activated.statusCode).toBe(200);

        // 4. The player signs in with the password THEY chose…
        const login = await app.inject({
            method: "POST",
            url: "/gameplay/auth/login",
            remoteAddress: perCallIp(),
            payload: { email, password: "mat-khau-42" },
        });
        expect(login.statusCode).toBe(200);
        const cookie = `gameplay_session=${String(login.headers["set-cookie"]).split("gameplay_session=")[1]?.split(";")[0]}`;

        // …types the code the desk reads out, and is seated on the spot.
        const matchId = await makeMatch("Walk-in table", []);
        const code = await mintRoomCode(matchId);
        const seated = await claim(code, cookie);
        expect(seated.statusCode).toBe(200);
        expect(seated.json()).toMatchObject({ matchId, slug: SLUG });

        // 5. Which is exactly what the navbar's one-click «Vào trận» opens.
        const mine = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: { cookie } });
        const items = (mine.json() as { items: Array<{ matchId: string }> }).items;
        expect(items.map((item) => item.matchId)).toContain(matchId);
    });
});
