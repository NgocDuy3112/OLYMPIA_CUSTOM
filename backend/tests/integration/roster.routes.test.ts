import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { auditEvents, matchStats, matches, tournamentPlayers, tournaments, users } from "../../src/db/schema/index.js";
import { signToken, signVerifyEmail } from "../../src/lib/jwt.js";

// Making a contestant — two ways onto a roster.
//
//  · the player registered THEIR OWN account (email + password they chose,
//    verified by mail) — the operator enrolls the ADDRESS, never the password;
//  · a show-floor contestant never registers — the console CREATES the identity
//    a seat points at.
//
// These tests are the contract for both: a real PLAYER row either way, enrolled
// in the same call, never two the same name on one roster.

let app: FastifyInstance;
let ownerCookie: string;
let tournamentId: string;

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const createUrl = () => `/portal/tournaments/${tournamentId}/players/new`;

const add = (displayName: string, cookie = ownerCookie) =>
    app.inject({
        method: "POST",
        url: createUrl(),
        headers: auth(cookie),
        payload: { displayName }
    });

const addWithEmail = (displayName: string, email: string) =>
    app.inject({
        method: "POST",
        url: createUrl(),
        headers: auth(ownerCookie),
        payload: { displayName, email }
    });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db
        .insert(users)
        .values({ role: "OPERATOR", username: "roster-owner", displayName: "Roster Owner", tokenVersion: 0 })
        .returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const [tournament] = await db
        .insert(tournaments)
        .values({
            ownerId: owner.id,
            visibility: "PUBLIC",
            slug: "roster-tournament",
            name: "Roster Tournament",
            rounds: [{ id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }],
            format: { competitorsPerMatch: 4 },
            stages: [{ id: "s1", title: "Stage s1" }]
        })
        .returning();
    tournamentId = tournament.id;
});

afterAll(async () => {
    await app.close();
});

describe("a contestant is created and enrolled in one call", () => {
    it("returns the new contestant, undrawn", async () => {
        const res = await add("An");
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ displayName: "An", group: null });
    });

    it("writes a real PLAYER row, with an email the schema requires", async () => {
        const res = await add("Bình");
        const { userId } = res.json() as { userId: string };

        const [row] = await db.select().from(users).where(eq(users.id, userId));
        expect(row.role).toBe("PLAYER");
        expect(row.displayName).toBe("Bình");
        // the PLAYER role requires an email; this one is a placeholder, never mailed
        expect(row.email).toMatch(/@players\.invalid$/);
        expect(row.passwordHash).toBeNull();
    });

    it("enrolls them in the tournament in the same call", async () => {
        const res = await add("Chi");
        const { userId } = res.json() as { userId: string };

        const rows = await db
            .select()
            .from(tournamentPlayers)
            .where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
        expect(rows).toHaveLength(1);
        expect(rows[0].group).toBeNull();
    });

    it("trims the name", async () => {
        const res = await add("  Dũng  ");
        expect((res.json() as { displayName: string }).displayName).toBe("Dũng");
    });
});

describe("the roster refuses what an operator would regret", () => {
    it("refuses a second contestant with the same name", async () => {
        await add("Em");
        const res = await add("em"); // case-insensitive: the rail reads names
        expect(res.statusCode).toBe(409);
        expect((res.json() as { message: string }).message).toContain("already a contestant");
    });

    it("refuses an empty name", async () => {
        const res = await add("   ");
        // the schema's minLength(1) passes on spaces, so the service answers
        expect([400, 409]).toContain(res.statusCode);
    });

    it("refuses a caller who may not write the tournament", async () => {
        const [stranger] = await db
            .insert(users)
            .values({ role: "OPERATOR", username: "roster-stranger", displayName: "Stranger", tokenVersion: 0 })
            .returning();
        const cookie = signToken(app, "PORTAL", { sub: stranger.id, role: "OPERATOR", tokenVersion: 0 });

        const res = await add("Giang", cookie);
        expect(res.statusCode).toBe(403);
    });

    it("refuses an unauthenticated caller", async () => {
        const res = await app.inject({
            method: "POST",
            url: createUrl(),
            payload: { displayName: "Hà" }
        });
        expect(res.statusCode).toBe(401);
    });
});

describe("the email is what makes the identity claimable", () => {
    it("keeps the address, so a Google sign-in can attach to this very row", async () => {
        const res = await addWithEmail("Hạnh", "hanh@example.test");
        expect(res.statusCode).toBe(200);
        const { userId } = res.json() as { userId: string };

        const [row] = await db.select().from(users).where(eq(users.id, userId));
        // provisionPlayer() matches by email and links the Google sub to this user,
        // so their matches/answers/standings were never on another row to begin with
        expect(row.email).toBe("hanh@example.test");
        expect(row.emailVerified).toBe(false); // we have not verified it; Google will
    });

    it("normalises the address (case and spaces)", async () => {
        const res = await addWithEmail("Linh", "  Linh@Example.Test ");
        const { userId } = res.json() as { userId: string };
        const [row] = await db.select().from(users).where(eq(users.id, userId));
        expect(row.email).toBe("linh@example.test");
    });

    it("falls back to a placeholder when no address is given", async () => {
        const res = await add("Khánh");
        const { userId } = res.json() as { userId: string };
        const [row] = await db.select().from(users).where(eq(users.id, userId));
        expect(row.email).toMatch(/@players\.invalid$/);
    });

    it("refuses an address that already belongs to someone, naming them", async () => {
        const first = await addWithEmail("Minh", "minh@example.test");
        expect(first.statusCode).toBe(200);

        const again = await addWithEmail("Minh khác", "minh@example.test");
        expect(again.statusCode).toBe(409);
        const body = again.json() as { message: string; details?: string[] };
        expect(body.message).toContain("already belongs to Minh");
        // the operator gets the identity to enroll instead of a second row
        const { userId } = first.json() as { userId: string };
        expect(body.details).toEqual([userId, "Minh"]);
    });

    it("refuses something that is not an email", async () => {
        const res = await addWithEmail("Sai", "khong-phai-email");
        expect(res.statusCode).toBe(400);
    });
});

describe("enrolling an account by its address", () => {
    const byEmailUrl = () => `/portal/tournaments/${tournamentId}/players/by-email`;
    const enroll = (email: string) =>
        app.inject({ method: "POST", url: byEmailUrl(), headers: auth(ownerCookie), payload: { email } });

    /** A player who registered and opened the mail link — the real precondition. */
    const registered = async (email: string) => {
        const res = await app.inject({
            method: "POST",
            url: "/gameplay/auth/register",
            payload: { email, password: "mat-khau-42", displayName: `Owner ${email}` },
        });
        expect(res.statusCode).toBe(200);
        const [row] = await db.select().from(users).where(eq(users.email, email));
        const verify = await app.inject({
            method: "GET",
            url: `/gameplay/auth/verify?token=${signVerifyEmail(app, row!.id)}`,
        });
        expect(verify.statusCode).toBe(302);
        return row!.id;
    };

    it("seats a player who registered five minutes ago, without knowing their password", async () => {
        const userId = await registered("moi-dang-ky@example.test");
        const res = await enroll("  Moi-Dang-Ky@Example.Test ");
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ userId, email: "moi-dang-ky@example.test", group: null });

        const roster = await app.inject({ method: "GET", url: `/portal/tournaments/${tournamentId}/players`, headers: auth(ownerCookie) });
        const ids = (roster.json().items as Array<{ userId: string }>).map((row) => row.userId);
        expect(ids).toContain(userId);
    });

    it("404s an address nobody has registered yet, saying what to do", async () => {
        const res = await enroll("chua-ky@example.test");
        expect(res.statusCode).toBe(404);
        expect((res.json() as { message: string }).message).toContain("ask them to register first");
    });

    it("enrolls an account that has NOT opened its mail link — the roster's «Xác thực» finishes the job", async () => {
        await app.inject({
            method: "POST",
            url: "/gameplay/auth/register",
            payload: { email: "chua-xac-thuc@example.test", password: "mat-khau-42", displayName: "Chưa xác thực" },
        });

        // Step 7, decision 2: on a floor without SMTP the link may never be
        // opened, and refusing the address here would keep the account OUT of
        // the roster — where the operator's verify button lives.
        const res = await enroll("chua-xac-thuc@example.test");
        expect(res.statusCode).toBe(200);

        const roster = await app.inject({ method: "GET", url: `/portal/tournaments/${tournamentId}/players`, headers: auth(ownerCookie) });
        const row = (roster.json().items as Array<{ email: string; emailVerified: boolean }>)
            .find((item) => item.email === "chua-xac-thuc@example.test");
        expect(row?.emailVerified).toBe(false);
    });

    it("403s a disabled account — it cannot come back by itself", async () => {
        const userId = await registered("disabled-player@example.test");
        await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));

        const res = await enroll("disabled-player@example.test");
        expect(res.statusCode).toBe(403);
        expect((res.json() as { message: string }).message).toContain("disabled");
    });

    it("409s the second enrollment of the same address", async () => {
        await registered("enroll-2x@example.test");
        expect((await enroll("enroll-2x@example.test")).statusCode).toBe(200);
        const again = await enroll("enroll-2x@example.test");
        expect(again.statusCode).toBe(409);
        expect((again.json() as { message: string }).message).toContain("already on this roster");
    });

    it("404s a show-floor placeholder address — nobody registered it", async () => {
        const { userId } = (await add("Show Floor")).json() as { userId: string };
        const [row] = await db.select().from(users).where(eq(users.id, userId));
        const res = await enroll(row!.email!);
        expect(res.statusCode).toBe(404);
    });

    it("refuses something that is not an address, and a stranger's cookie", async () => {
        expect((await enroll("khong-phai-email")).statusCode).toBe(400);

        const [stranger] = await db
            .insert(users)
            .values({ role: "OPERATOR", username: "by-email-stranger", displayName: "Stranger", tokenVersion: 0 })
            .returning();
        const cookie = signToken(app, "PORTAL", { sub: stranger.id, role: "OPERATOR", tokenVersion: 0 });
        const res = await app.inject({
            method: "POST",
            url: byEmailUrl(),
            headers: auth(cookie),
            payload: { email: "moi-dang-ky@example.test" },
        });
        expect(res.statusCode).toBe(403);
    });
});

const edit = (userId: string, body: unknown) =>
    app.inject({ method: "PATCH", url: `/portal/tournaments/${tournamentId}/players/${userId}`, headers: auth(ownerCookie), payload: body as object });

const remove = (userId: string) =>
    app.inject({ method: "DELETE", url: `/portal/tournaments/${tournamentId}/players/${userId}`, headers: auth(ownerCookie) });

describe("editing a contestant", () => {
    it("renames them, and the roster shows the new name", async () => {
        const { userId } = (await add("Nghĩa")).json() as { userId: string };
        const res = await edit(userId, { displayName: "  Nghĩa Vũ  " });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { displayName: string }).displayName).toBe("Nghĩa Vũ");
    });

    it("attaches an address later — the point of the whole exercise", async () => {
        const { userId } = (await add("Oanh")).json() as { userId: string };
        const res = await edit(userId, { email: "Oanh@Example.Test" });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { email: string | null }).email).toBe("oanh@example.test");
    });

    it("detaches the address back to a show-floor identity", async () => {
        const { userId } = (await addWithEmail("Phúc", "phuc@example.test")).json() as { userId: string };
        const res = await edit(userId, { email: null });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { email: string | null }).email).toBeNull();
    });

    it("refuses a name another contestant already has", async () => {
        await add("Quyên");
        const { userId } = (await add("Rạng")).json() as { userId: string };
        const res = await edit(userId, { displayName: "quyên" });
        expect(res.statusCode).toBe(409);
    });

    it("refuses an address that belongs to someone else, naming them", async () => {
        await addWithEmail("Sơn", "son@example.test");
        const { userId } = (await add("Tâm")).json() as { userId: string };
        const res = await edit(userId, { email: "son@example.test" });
        expect(res.statusCode).toBe(409);
        expect((res.json() as { message: string }).message).toContain("already belongs to Sơn");
    });

    it("refuses a user who is not on this roster", async () => {
        const res = await edit("00000000-0000-4000-8000-000000000000", { displayName: "X" });
        expect(res.statusCode).toBe(403);
    });
});

describe("taking a contestant off the roster", () => {
    it("removes somebody who never played", async () => {
        const { userId } = (await add("Uyên")).json() as { userId: string };
        const res = await remove(userId);
        expect(res.statusCode).toBe(200);

        const roster = await app.inject({ method: "GET", url: `/portal/tournaments/${tournamentId}/players`, headers: auth(ownerCookie) });
        const ids = (roster.json().items as Array<{ userId: string }>).map((row) => row.userId);
        expect(ids).not.toContain(userId);
    });

    it("refuses the second time — they are not on the roster any more", async () => {
        const { userId } = (await add("Vinh")).json() as { userId: string };
        await remove(userId);
        expect((await remove(userId)).statusCode).toBe(403);
    });
});

describe("the guards that keep a record from vanishing", () => {
    /** A finished-ish match of this tournament, with the contestant either seated or stat-ed. */
    const aMatch = async (seats: string[]) => {
        const [match] = await db
            .insert(matches)
            .values({
                tournamentId,
                stageId: "s1",
                scheduledAt: new Date(),
                label: "Guard match",
                status: "UPCOMING",
                players: seats.map((userId, index) => ({ kind: "user" as const, userId, seed: index + 1 })),
                roundConfigs: {},
                questions: []
            })
            .returning({ id: matches.id });
        return match!.id;
    };

    it("refuses to remove a contestant who still holds a seat", async () => {
        const { userId } = (await add("Yến")).json() as { userId: string };
        await aMatch([userId]);

        const res = await remove(userId);
        expect(res.statusCode).toBe(409);
        expect((res.json() as { message: string }).message).toContain("still holds a seat");
    });

    it("refuses to remove a contestant who has played (stats on the record)", async () => {
        const { userId } = (await add("Zũ")).json() as { userId: string };
        const matchId = await aMatch([]);
        // the table's grain is per QUESTION (a check constraint enforces it)
        await db.insert(matchStats).values({
            matchId,
            tournamentId,
            roundId: "khoi-dong",
            questionId: randomUUID(),
            userId
        });

        const res = await remove(userId);
        expect(res.statusCode).toBe(409);
        expect((res.json() as { message: string }).message).toContain("results are on the record");
    });
});

// ── step 7: the desk's two account actions ──────────────────────────────────
//
// SMTP stays optional on the floor because these exist: the operator can SEE
// the account a player registered a minute ago, so they activate it themselves
// («Xác thực») and hand back a one-time entry code when a password is
// forgotten. Neither action ever touches a password — there is none to touch.

let accountIpTick = 0;
/** The register/login routes count per IP; each call gets its own. */
const accountIp = () => `10.7.${Math.floor(accountIpTick / 200)}.${(accountIpTick++ % 200) + 1}`;

const verifyUrl = (userId: string) => `/portal/tournaments/${tournamentId}/players/${userId}/verify`;
const entryCodeUrl = (userId: string) => `/portal/tournaments/${tournamentId}/players/${userId}/entry-code`;

/** Registered but NOT opened the mail link — the state these actions exist for. */
async function registeredUnverified(email: string, displayName: string): Promise<string> {
    const res = await app.inject({
        method: "POST",
        url: "/gameplay/auth/register",
        remoteAddress: accountIp(),
        payload: { email, password: "mat-khau-42", displayName },
    });
    expect(res.statusCode).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.email, email));
    return row!.id;
}

const enrollDirectly = async (userId: string) => {
    const res = await app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/players`,
        headers: auth(ownerCookie),
        payload: { userIds: [userId] },
    });
    expect(res.statusCode).toBe(200);
};

const verify = (userId: string, cookie = ownerCookie) =>
    app.inject({ method: "POST", url: verifyUrl(userId), headers: auth(cookie) });

const issueEntry = (userId: string, cookie = ownerCookie) =>
    app.inject({ method: "POST", url: entryCodeUrl(userId), headers: auth(cookie) });

describe("activating an account — the operator vouches for the address", () => {
    it("verifies an account the player registered but never opened", async () => {
        const userId = await registeredUnverified("activate-me@example.test", "Kích hoạt");
        await enrollDirectly(userId);

        const res = await verify(userId);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ userId, emailVerified: true });

        const [row] = await db.select().from(users).where(eq(users.id, userId));
        expect(row.emailVerified).toBe(true);

        // …and the door the mail link used to open now opens for them.
        const login = await app.inject({
            method: "POST",
            url: "/gameplay/auth/login",
            remoteAddress: accountIp(),
            payload: { email: "activate-me@example.test", password: "mat-khau-42" },
        });
        expect(login.statusCode).toBe(200);
    });

    it("is idempotent — the second click is not an error", async () => {
        const userId = await registeredUnverified("activate-again@example.test", "Kích hoạt hai");
        await enrollDirectly(userId);
        expect((await verify(userId)).statusCode).toBe(200);
        expect((await verify(userId)).statusCode).toBe(200);
    });

    it("refuses a show-floor identity: there is no account behind the row", async () => {
        const { userId } = (await add("Không Tài Khoản")).json() as { userId: string };
        const res = await verify(userId);
        expect(res.statusCode).toBe(400);
        expect((res.json() as { message: string }).message).toContain("no account behind it");
    });

    it("refuses somebody not on this roster, and a stranger's cookie", async () => {
        const outsider = await registeredUnverified("outsider@example.test", "Ở Ngoài");
        const notEnrolled = await verify(outsider);
        expect(notEnrolled.statusCode).toBe(403);
        expect((notEnrolled.json() as { error: string }).error).toBe("NOT_ENROLLED");

        const userId = await registeredUnverified("stranger-verify@example.test", "Xác Thực Lạ");
        await enrollDirectly(userId);
        const [stranger] = await db
            .insert(users)
            .values({ role: "OPERATOR", username: "verify-stranger", displayName: "Stranger", tokenVersion: 0 })
            .returning();
        const cookie = signToken(app, "PORTAL", { sub: stranger!.id, role: "OPERATOR", tokenVersion: 0 });
        expect((await verify(userId, cookie)).statusCode).toBe(403);
    });

    it("is on the record: the trust action is audited", async () => {
        const userId = await registeredUnverified("audited-verify@example.test", "Có Nhật Ký");
        await enrollDirectly(userId);
        await verify(userId);

        const events = await db.select().from(auditEvents).where(eq(auditEvents.action, "tournament_updated"));
        const event = events.find((row) => (row.details as { activated?: string } | null)?.activated === userId);
        expect(event).toBeTruthy();
        expect(event!.targetId).toBe(userId);
    });
});

describe("a one-time entry code — the forgotten-password path", () => {
    /** Verified + enrolled: the two preconditions, each done the honest way. */
    async function readyPlayer(email: string, displayName: string): Promise<string> {
        const userId = await registeredUnverified(email, displayName);
        await enrollDirectly(userId);
        expect((await verify(userId)).statusCode).toBe(200);
        return userId;
    }

    it("hands out a six-character code bound to that player's own account", async () => {
        const userId = await readyPlayer("entry-roster@example.test", "Nhập Mã");

        const res = await issueEntry(userId);
        expect(res.statusCode).toBe(200);
        const body = res.json() as { userId: string; email: string; code: string; expiresAt: string };
        expect(body).toMatchObject({ userId, email: "entry-roster@example.test" });
        expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
        expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("refuses before activation — «Xác thực» is one row above", async () => {
        const userId = await registeredUnverified("entry-unverified@example.test", "Chưa Xác Thực");
        await enrollDirectly(userId);

        const res = await issueEntry(userId);
        expect(res.statusCode).toBe(403);
        expect((res.json() as { message: string }).message).toContain("Xác thực");
    });

    it("refuses a show-floor identity — there is no account to sign in to", async () => {
        const { userId } = (await add("Vô Tài Khoản")).json() as { userId: string };
        const res = await issueEntry(userId);
        expect(res.statusCode).toBe(400);
        expect((res.json() as { message: string }).message).toContain("no account to sign in to");
    });

    it("refuses somebody not on this roster, and a stranger's cookie", async () => {
        const outsider = await registeredUnverified("entry-outsider@example.test", "Ở Ngoài Mã");
        const notEnrolled = await issueEntry(outsider);
        expect(notEnrolled.statusCode).toBe(403);
        expect((notEnrolled.json() as { error: string }).error).toBe("NOT_ENROLLED");

        const userId = await readyPlayer("entry-stranger@example.test", "Mã Lạ");
        const [stranger] = await db
            .insert(users)
            .values({ role: "OPERATOR", username: "entry-stranger", displayName: "Stranger", tokenVersion: 0 })
            .returning();
        const cookie = signToken(app, "PORTAL", { sub: stranger!.id, role: "OPERATOR", tokenVersion: 0 });
        expect((await issueEntry(userId, cookie)).statusCode).toBe(403);
    });

    it("records that a code was issued — never the code itself", async () => {
        const userId = await readyPlayer("entry-audited@example.test", "Mã Có Nhật Ký");
        const issued = await issueEntry(userId);
        const { code } = issued.json() as { code: string };

        const events = await db.select().from(auditEvents).where(eq(auditEvents.action, "tournament_updated"));
        const trail = events.filter(
            (row) => (row.details as { entryCodeFor?: string } | null)?.entryCodeFor === userId
        );
        expect(trail.length).toBeGreaterThan(0);
        expect(JSON.stringify(trail)).not.toContain(code);
    });
});
