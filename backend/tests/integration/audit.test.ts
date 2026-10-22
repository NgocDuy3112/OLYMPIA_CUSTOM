import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { auditEvents, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import { audit, mcpAuditDetails, type AuditAction } from "../../src/modules/audit/index.js";


let app: FastifyInstance;
let adminId: string;
let ownerId: string;
let adminCookie: string;
let ownerCookie: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

const eventsFor = (action: string, predicate: (details: Record<string, unknown>) => boolean) =>
    db.select().from(auditEvents).where(eq(auditEvents.action, action))
        .then((rows) => rows.filter((row) => predicate((row.details ?? {}) as Record<string, unknown>)));

const tournamentInput = (name: string) => ({
    name,
    tags: ["THTH"],
    rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    format: {
        competitorsPerMatch: 2,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    placementTiers: [{ min: 1, max: 2, points: 10 }],
    stages: [{ id: "stage-1", title: "Stage 1" }]
});

async function makeTournament(name: string): Promise<{ tournamentId: string }> {
    const tournament = await app.inject({
        method: "POST",
        url: "/portal/tournaments",
        headers: auth(ownerCookie),
        payload: tournamentInput(name)
    });
    if (tournament.statusCode !== 201) throw new Error(`tournament: ${tournament.statusCode} ${tournament.body}`);

    return { tournamentId: tournament.json().id };
}

async function makePublishedQuestion(): Promise<string> {
    const created = await app.inject({
        method: "POST",
        url: `/portal/questions`,
        headers: auth(ownerCookie),
        payload: {
            kind: "MC",
            questionText: "audit question",
            tag: "THTH",
            payload: { options: [{ id: "A", text: "4" }], correctSet: ["A"] }
        }
    });

    const id = created.json().id;
    const url = `/portal/questions/${id}/status`;

    await app.inject({ method: "PATCH", url, headers: auth(ownerCookie), payload: { status: "PENDING" } });
    await app.inject({ method: "PATCH", url, headers: auth(adminCookie), payload: { status: "PUBLISHED" } });

    return id;
}

beforeAll(async () => {
    app = await buildApp();

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "aud-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "aud-owner", displayName: "Owner" }
        ])
        .returning({ id: users.id });

    adminId = rows[0].id;
    ownerId = rows[1].id;
    adminCookie = portalCookie(adminId, "ADMIN");
    ownerCookie = portalCookie(ownerId, "OPERATOR");
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("audit writer", () => {
    it("records every field it is given", async () => {
        await audit({
            action: "paused",
            actorId: ownerId,
            targetId: adminId,
            details: { reason: "test", nested: { deep: true } },
            ip: "10.0.0.9",
            userAgent: "vitest/1.0"
        });

        const [row] = await db.select().from(auditEvents).where(eq(auditEvents.action, "paused"));

        expect(row.actorId).toBe(ownerId);
        expect(row.targetId).toBe(adminId);
        expect(row.details).toEqual({ reason: "test", nested: { deep: true } });
        expect(row.ip).toBe("10.0.0.9");
        expect(row.userAgent).toBe("vitest/1.0");
        expect(row.createdAt).toBeInstanceOf(Date);
    });

    it("is best-effort: a failing insert never throws to the caller", async () => {
        // action column is varchar(100) — a longer value must fail in SQL, not in the caller
        await expect(
            audit({ action: "x".repeat(200) as AuditAction, details: { overflow: true } })
        ).resolves.toBeUndefined();
    });

    it("mcpAuditDetails always carries the key id (doc convention)", () => {
        const details = mcpAuditDetails("key-1", { tool: "list_questions" });
        expect(details).toEqual({ mcpKeyId: "key-1", tool: "list_questions" });
    });
});


describe("audit wiring — MCP keys", () => {
    it("records issuance and revocation without ever storing the token", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/mcp-keys",
            headers: auth(ownerCookie),
            payload: { label: "audited key", scopes: ["READ", "WRITE"] }
        });

        const token = created.json().token;
        const keyId = created.json().key.id;

        const issued = await eventsFor("mcp_key_issued", (d) => d.mcpKeyId === keyId);
        expect(issued).toHaveLength(1);
        expect(issued[0].actorId).toBe(ownerId);
        expect(issued[0].details).toMatchObject({ prefix: created.json().key.prefix, label: "audited key" });
        expect(JSON.stringify(issued[0].details)).not.toContain(token);

        await app.inject({
            method: "DELETE",
            url: `/portal/mcp-keys/${keyId}`,
            headers: auth(ownerCookie)
        });

        const revoked = await eventsFor("mcp_key_revoked", (d) => d.mcpKeyId === keyId);
        expect(revoked).toHaveLength(1);
    });
});


describe("audit wiring — the question review gate", () => {
    it("records submit / publish / archive, but not a send-back or a content edit", async () => {
        const { tournamentId } = await makeTournament("aud-gate");

        const created = await app.inject({
            method: "POST",
            url: `/portal/questions`,
            headers: auth(ownerCookie),
            payload: {
                kind: "MC",
                questionText: "gate question",
                tag: "THTH",
                payload: { options: [{ id: "A", text: "4" }], correctSet: ["A"] }
            }
        });
        const questionId = created.json().id;
        const url = `/portal/questions/${questionId}/status`;

        // a plain content edit is not an audit event
        await app.inject({
            method: "PATCH",
            url: `/portal/questions/${questionId}`,
            headers: auth(ownerCookie),
            payload: { questionText: "edited, still not an event" }
        });
        expect(await eventsFor("question_submitted", (d) => d.questionId === questionId)).toHaveLength(0);

        await app.inject({ method: "PATCH", url, headers: auth(ownerCookie), payload: { status: "PENDING" } });
        expect(await eventsFor("question_submitted", (d) => d.questionId === questionId)).toHaveLength(1);

        // sending it back is not an audited action
        await app.inject({ method: "PATCH", url, headers: auth(ownerCookie), payload: { status: "DRAFT" } });
        expect(await eventsFor("question_submitted", (d) => d.questionId === questionId)).toHaveLength(1);

        await app.inject({ method: "PATCH", url, headers: auth(ownerCookie), payload: { status: "PENDING" } });
        await app.inject({ method: "PATCH", url, headers: auth(adminCookie), payload: { status: "PUBLISHED" } });
        const published = await eventsFor("question_published", (d) => d.questionId === questionId);
        expect(published).toHaveLength(1);
        expect(published[0].actorId).toBe(adminId);            // the reviewer is recorded
        expect(published[0].details).toMatchObject({ tag: "THTH", kind: "MC" });

        await app.inject({
            method: "DELETE",
            url: `/portal/questions/${questionId}`,
            headers: auth(ownerCookie)
        });
        expect(await eventsFor("question_archived", (d) => d.questionId === questionId)).toHaveLength(1);
    });
});


describe("audit wiring — match lifecycle", () => {
    it("records match_started and match_ended, and ignores a same-status no-op", async () => {
        const { tournamentId } = await makeTournament("aud-match");
        const sourceId = await makePublishedQuestion();

        const created = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/matches`,
            headers: auth(ownerCookie),
            payload: {
                stageId: "stage-1",
                label: "Audited match",
                scheduledAt: "2026-03-01T10:00:00Z",
                players: [
                    { kind: "user", userId: "00000000-0000-4000-8000-000000000001", seed: 1 },
                    { kind: "user", userId: "00000000-0000-4000-8000-000000000002", seed: 2 }
                ],
                roundConfigs: {
                    r1: {
                        allowedKinds: ["MC", "TEXT", "KEYWORD"],
                        scoring: { template: "constant", points: 10 },
                        turns: [{ id: "turn-1", mode: "oral", delivery: "sequential" }]
                    }
                },
                questions: [{ roundId: "r1", turnId: "turn-1", sourceId }]
            }
        });
        const matchId = created.json().id;
        const statusUrl = `/portal/tournaments/${tournamentId}/matches/${matchId}/status`;

        await app.inject({ method: "PATCH", url: statusUrl, headers: auth(ownerCookie), payload: { status: "LIVE" } });
        const started = await eventsFor("match_started", (d) => d.matchId === undefined || true);
        const mine = (await db.select().from(auditEvents).where(eq(auditEvents.action, "match_started")))
            .filter((row) => row.matchId === matchId);
        expect(mine).toHaveLength(1);
        expect(mine[0].details).toMatchObject({ from: "UPCOMING", to: "LIVE", tournamentId });
        expect(started.length).toBeGreaterThan(0);

        await app.inject({ method: "PATCH", url: statusUrl, headers: auth(ownerCookie), payload: { status: "FINISHED" } });
        const ended = (await db.select().from(auditEvents).where(eq(auditEvents.action, "match_ended")))
            .filter((row) => row.matchId === matchId);
        expect(ended).toHaveLength(1);

        // same-status no-op must not produce another event
        await app.inject({ method: "PATCH", url: statusUrl, headers: auth(ownerCookie), payload: { status: "FINISHED" } });
        const endedAgain = (await db.select().from(auditEvents).where(eq(auditEvents.action, "match_ended")))
            .filter((row) => row.matchId === matchId);
        expect(endedAgain).toHaveLength(1);
    });
});
