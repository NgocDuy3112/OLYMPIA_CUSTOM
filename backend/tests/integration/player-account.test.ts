import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { matches, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// A player's account, as step 8 issues it: the DESK creates the row (handle
// derived from the name, first password typed by the operator), the player
// signs in with that handle, and their own password is not optional — until it
// exists, every authenticated route except whoami/logout/change-password says
// so with 409.
//
// Nothing here types an email to sign up with: registration is gone, and so is
// the verification mail it used to carry.

let app: FastifyInstance;
let ownerCookie: string;
let tournamentId: string;

const FIRST_PASSWORD = "mat-khau-2026";

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

/** The rate-limited routes count per IP — one address per call. */
let ipTick = 0;
const perCallIp = () => `10.6.${Math.floor(ipTick / 200)}.${(ipTick++ % 200) + 1}`;

const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"] ?? "");
const sessionOf = (res: { headers: Record<string, unknown> }) =>
    `gameplay_session=${(cookieOf(res).split("gameplay_session=")[1] ?? "").split(";")[0]}`;

/** Create the account the way the roster does: name in, handle + first password out. */
async function createPlayer(displayName: string, password = FIRST_PASSWORD) {
    const res = await app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/players/new`,
        headers: auth(ownerCookie),
        payload: { displayName, password },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as { userId: string; displayName: string; username: string };
}

const login = (username: string, password: string) =>
    app.inject({
        method: "POST",
        url: "/gameplay/auth/login",
        remoteAddress: perCallIp(),
        payload: { username, password },
    });

const changePassword = (cookie: string, currentPassword: string, newPassword: string) =>
    app.inject({
        method: "POST",
        url: "/gameplay/auth/change-password",
        remoteAddress: perCallIp(),
        headers: { cookie },
        payload: { currentPassword, newPassword },
    });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db
        .insert(users)
        .values({ role: "OPERATOR", username: "account-owner", displayName: "Account Owner", tokenVersion: 0 })
        .returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner!.id, role: "OPERATOR", tokenVersion: 0 });

    const [tournament] = await db
        .insert(tournaments)
        .values({
            ownerId: owner!.id,
            visibility: "PUBLIC",
            slug: "account-cup",
            name: "Account Cup",
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

describe("the desk creates the account", () => {
    it("derives the handle from the name, and never asks for it twice", async () => {
        const created = await createPlayer("Ngọc Duy");
        expect(created.username).toBe("ngoc-duy");
        expect(created.displayName).toBe("Ngọc Duy");
    });

    it("gives the SAME handle to nobody else — the second Ngọc Duy is #-2", async () => {
        const first = await createPlayer("Trần Thị Hoa");
        const second = await createPlayer("Trần  Thị   Hoa"); // same name, different spacing
        expect(first.username).toBe("tran-thi-hoa");
        expect(second.username).toBe("tran-thi-hoa-2");
    });

    it("stores a hash of the DESK's password, and flags it as theirs to replace", async () => {
        const created = await createPlayer("Chưa Đổi");
        const [row] = await db.select().from(users).where(eq(users.id, created.userId));

        expect(row.username).toBe("chua-doi");
        expect(row.passwordHash).toMatch(/^\$argon2/);
        expect(row.passwordHash).not.toContain(FIRST_PASSWORD);
        expect(row.mustChangePassword).toBe(true);
        expect(row.tokenVersion).toBe(0);
    });

    it("refuses a first password that is not a password yet", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/players/new`,
            headers: auth(ownerCookie),
            payload: { displayName: "Ngắn", password: "ngan" },
        });
        expect(res.statusCode).toBe(400);
    });
});

describe("signing in with the handle", () => {
    it("takes the desk's password and answers with the forced change", async () => {
        const created = await createPlayer("Đăng Nhập");

        const res = await login(created.username, FIRST_PASSWORD);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            id: created.userId,
            username: created.username,
            mustChangePassword: true,
        });
        expect(cookieOf(res)).toContain("gameplay_session=");
    });

    it("folds the case the handle is typed in — NGOC-DOY is one player", async () => {
        const created = await createPlayer("Gõ Hoa");
        const res = await login(`  ${created.username.toUpperCase()}  `, FIRST_PASSWORD);
        expect(res.statusCode).toBe(200);
        expect((res.json() as { id: string }).id).toBe(created.userId);
    });

    it("says the same thing for an unknown handle and a wrong password", async () => {
        const created = await createPlayer("Từ Chối");

        const wrong = await login(created.username, "khong-phai-mat-khau");
        const unknown = login("khong-co-tai-khoan", FIRST_PASSWORD);
        expect(wrong.statusCode).toBe(401);
        expect((await unknown).statusCode).toBe(401);
        expect((wrong.json() as { message: string }).message).toBe(
            ((await unknown).json() as { message: string }).message
        );
    });

    it("refuses a disabled account", async () => {
        const created = await createPlayer("Bị Khoá");
        await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, created.userId));

        const res = await login(created.username, FIRST_PASSWORD);
        expect(res.statusCode).toBe(403);
    });
});

describe("the gate — the desk's password is not the player's", () => {
    it("409s everything except whoami, logout and the change itself", async () => {
        const created = await createPlayer("Bị Kẹt");
        const session = await login(created.username, FIRST_PASSWORD);
        const cookie = sessionOf(session);

        // whoami is exempt: the navbar has to show a name to explain itself
        const me = await app.inject({ method: "GET", url: "/gameplay/auth/me", headers: { cookie } });
        expect(me.statusCode).toBe(200);

        // the logout door is exempt too
        const logout = await app.inject({ method: "POST", url: "/gameplay/auth/logout", headers: { cookie } });
        expect(logout.statusCode).toBe(200);

        // and play is not
        const seat = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: { cookie } });
        expect(seat.statusCode).toBe(409);
        expect((seat.json() as { error: string }).error).toBe("PASSWORD_CHANGE_REQUIRED");

        const claim = await app.inject({
            method: "POST",
            url: "/gameplay/join/claim",
            headers: { cookie },
            payload: { code: "ABC234" },
        });
        expect(claim.statusCode).toBe(409);
    });

    it("releases the gate only for the player's OWN password", async () => {
        const created = await createPlayer("Đổi Mật Khẩu");
        const session = await login(created.username, FIRST_PASSWORD);
        const cookie = sessionOf(session);

        const wrongCurrent = await changePassword(cookie, "sai-het", "mat-khau-moi-1");
        expect(wrongCurrent.statusCode).toBe(401);

        const tooShort = await changePassword(cookie, FIRST_PASSWORD, "ngan");
        expect(tooShort.statusCode).toBe(400);

        const same = await changePassword(cookie, FIRST_PASSWORD, FIRST_PASSWORD);
        expect(same.statusCode).toBe(400);

        const ok = await changePassword(cookie, FIRST_PASSWORD, "mat-khau-moi-1");
        expect(ok.statusCode).toBe(200);
        expect(ok.json()).toMatchObject({ ok: true });

        // The flag is gone, and the NEW password is what signs them in now.
        const [row] = await db.select().from(users).where(eq(users.id, created.userId));
        expect(row.mustChangePassword).toBe(false);

        const relogin = await login(created.username, "mat-khau-moi-1");
        expect(relogin.statusCode).toBe(200);
        expect((relogin.json() as { mustChangePassword: boolean }).mustChangePassword).toBe(false);

        const old = await login(created.username, FIRST_PASSWORD);
        expect(old.statusCode).toBe(401);
    });

    it("re-issues THIS browser's session, and retires the one the desk's password minted", async () => {
        const created = await createPlayer("Phiên Mới");
        const deskSession = await login(created.username, FIRST_PASSWORD);
        const cookie = sessionOf(deskSession);

        const changed = await changePassword(cookie, FIRST_PASSWORD, "mat-khau-moi-2");
        expect(changed.statusCode).toBe(200);
        const renewed = sessionOf(changed);

        // the player walks straight on: no second login after the change
        const seat = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: { cookie: renewed } });
        expect(seat.statusCode).toBe(200);

        // …while the session the DESK's password minted is dead (tokenVersion moved)
        const stale = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: { cookie } });
        expect(stale.statusCode).toBe(401);
    });
});

describe("which match am I in", () => {
    const session = async (displayName: string) => {
        const created = await createPlayer(displayName);
        const first = await login(created.username, FIRST_PASSWORD);
        const cookie = sessionOf(first);
        const changed = await changePassword(cookie, FIRST_PASSWORD, "mat-khau-rieng-1");
        return { id: created.userId, cookie: sessionOf(changed) };
    };

    it("answers an empty list for a player in no match", async () => {
        const { cookie } = await session("Không Trận");
        const res = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: { cookie } });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { items: unknown[] }).items).toEqual([]);
    });

    it("finds the match they are seated in, and ignores a finished one", async () => {
        const player = await session("Có Trận");
        const [operator] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, "account-owner"));

        const seat = [{ kind: "user" as const, userId: player.id, seed: 1 }];
        const base = {
            tournamentId,
            stageId: "s1",
            scheduledAt: new Date(),
            roundConfigs: {},
            questions: [],
            players: seat,
        };
        await db.insert(matches).values({ ...base, label: "Sắp diễn ra", status: "UPCOMING" });
        await db.insert(matches).values({ ...base, label: "Đã xong", status: "FINISHED", slot: 2 });
        expect(operator).toBeTruthy();

        const res = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: { cookie: player.cookie } });
        const items = (res.json() as { items: Array<{ label: string; slug: string }> }).items;
        expect(items.map((item) => item.label)).toEqual(["Sắp diễn ra"]);
        expect(items[0]?.slug).toBe("account-cup");
    });

    it("refuses without a session", async () => {
        const res = await app.inject({ method: "GET", url: "/gameplay/me/match" });
        expect(res.statusCode).toBe(401);
    });
});
