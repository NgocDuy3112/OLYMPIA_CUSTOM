import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { auditEvents, mcpKeys, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import { createMcpKey, revokeMcpKey } from "../../src/modules/mcp-keys/index.js";

let app: FastifyInstance;
let mcpUrl: string;

let adminCookie: string;
let ownerCookie: string;

let operatorToken: string;
let operatorKeyId: string;
let adminToken: string;
let announceToken: string;
let revokedToken: string;
let playerToken: string;

let pubTournamentId: string;
let privateTournamentId: string;
let foreignTournamentId: string;

let globalPublishedId: string;
let globalArchivedId: string;
let globalDraftId: string;
let tournamentPublishedId: string;
let foreignPublishedId: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

const tournamentInput = (slug: string) => ({
    name: "MCP Host",
    slug,
    defaultTags: ["THTH"],
    defaultRounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    defaultFormat: {
        competitorsPerMatch: 4,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    defaultPlacementTiers: [{ min: 1, max: 4, points: 10 }]
});

const mc = (text: string) => ({
    kind: "MC",
    questionText: text,
    tag: "THTH",
    payload: { options: [{ id: "A", text: "4" }, { id: "B", text: "5" }], correctSet: ["A"] }
});

async function makeTournament(slug: string, visibility?: "PRIVATE", cookie = ownerCookie): Promise<string> {
    const res = await app.inject({
        method: "POST",
        url: "/portal/tournaments",
        headers: auth(cookie),
        payload: {
            name: slug,
            tags: ["THTH"],
            rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
            format: {
                competitorsPerMatch: 4,
                allowedSeatKinds: ["user"],
                teamSize: null,
                teamAggregation: null,
                teamCountAggregation: null
            },
            placementTiers: [{ min: 1, max: 4, points: 10 }],
            ...(visibility ? { visibility } : {})
        }
    });
    if (res.statusCode !== 201) throw new Error(`tournament create: ${res.statusCode} ${res.body}`);
    return res.json().id;
}

async function createNested(text: string, tag = "THTH"): Promise<string> {
    const res = await app.inject({
        method: "POST",
        url: `/portal/questions`,
        headers: auth(ownerCookie),
        payload: { ...mc(text), tag }
    });
    if (res.statusCode !== 201) throw new Error(`nested create: ${res.statusCode} ${res.body}`);
    return res.json().id;
}

async function createGlobal(text: string): Promise<string> {
    const res = await app.inject({
        method: "POST",
        url: "/portal/questions",
        headers: auth(ownerCookie),
        payload: mc(text)
    });
    if (res.statusCode !== 201) throw new Error(`global create: ${res.statusCode} ${res.body}`);
    return res.json().id;
}

async function patchStatus(id: string, status: string, cookie: string) {
    const res = await app.inject({
        method: "PATCH",
        url: `/portal/questions/${id}/status`,
        headers: auth(cookie),
        payload: { status }
    });
    if (res.statusCode !== 200) throw new Error(`status ${status}: ${res.statusCode} ${res.body}`);
    return res.json();
}

// DRAFT → PENDING (operator) → PUBLISHED (admin only).
async function publish(id: string) {
    await patchStatus(id, "PENDING", ownerCookie);
    await patchStatus(id, "PUBLISHED", adminCookie);
}

async function connect(token: string) {
    const client = new Client({ name: "olympia-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
        authProvider: { token: async () => token }
    });
    await client.connect(transport);
    return { client, transport };
}

type ToolPayload = Record<string, unknown>;

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    const first = result.content?.[0];
    const text = first && first.type === "text" ? first.text : undefined;
    return {
        isError: result.isError === true,
        data: text ? (JSON.parse(text) as ToolPayload) : undefined
    };
}

async function issueToken(userId: string, scopes?: string[]) {
    return createMcpKey(userId, { label: "test", ...(scopes ? { scopes: scopes as never } : {}) });
}

let adminId: string;
let ownerId: string;

beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: "127.0.0.1" });

    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    mcpUrl = `http://127.0.0.1:${address.port}/mcp`;

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "mcp-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "mcp-owner", displayName: "Owner" },
            { role: "PLAYER", email: "mcp-player@example.test", displayName: "Player" }
        ])
        .returning({ id: users.id });

    adminId = rows[0].id;
    ownerId = rows[1].id;
    adminCookie = portalCookie(adminId, "ADMIN");
    ownerCookie = portalCookie(ownerId, "OPERATOR");

    const operator = await issueToken(ownerId);
    operatorToken = operator.token;
    operatorKeyId = operator.key.id;
    adminToken = (await issueToken(adminId)).token;
    announceToken = (await issueToken(ownerId, ["ANNOUNCE"])).token;
    playerToken = (await issueToken(rows[2].id)).token;

    const doomed = await issueToken(ownerId);
    revokedToken = doomed.token;
    await revokeMcpKey(doomed.key.id);

    pubTournamentId = await makeTournament("mcp-pub");
    privateTournamentId = await makeTournament("mcp-priv", "PRIVATE", adminCookie);
    foreignTournamentId = await makeTournament("mcp-foreign");

    globalPublishedId = await createGlobal("global published");
    await publish(globalPublishedId);

    globalArchivedId = await createGlobal("global archived");
    await patchStatus(globalArchivedId, "ARCHIVED", ownerCookie);

    globalDraftId = await createGlobal("global draft");

    tournamentPublishedId = await createNested("tournament published");
    await publish(tournamentPublishedId);

    // Another tag: not this tournament's to see.
    foreignPublishedId = await createNested("another tag", "VNTT");
    await publish(foreignPublishedId);
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("GET /mcp — transport and auth", () => {
    it("lists exactly the three read tools for a valid operator key", async () => {
        const { client, transport } = await connect(operatorToken);
        const { tools } = await client.listTools();

        expect(tools.map((t) => t.name).sort()).toEqual([
            "eligible_questions",
            "get_question",
            "list_questions"
        ]);
        const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
        for (const name of ["list_questions", "get_question", "eligible_questions"]) {
            expect(byName[name].annotations?.readOnlyHint).toBe(true);
        }
        await transport.terminateSession();
        await client.close();
    });

    it("rejects an unknown token at connect time", async () => {
        await expect(connect("ocmcp_00000000_" + "a".repeat(64))).rejects.toThrow();
    });

    it("rejects a revoked key at connect time", async () => {
        await expect(connect(revokedToken)).rejects.toThrow();
    });

    it("rejects a PLAYER-role key at connect time", async () => {
        await expect(connect(playerToken)).rejects.toThrow();
    });
});


describe("list_questions", () => {
    it("returns PUBLISHED and ARCHIVED of the tournament's tags, excludes DRAFT and other tags", async () => {
        const { client, transport } = await connect(operatorToken);
        const { isError, data } = await callTool(client, "list_questions", {
            tournamentId: pubTournamentId
        });

        expect(isError).toBe(false);
        const items = data!.items as Array<{ id: string; status: string; usable: boolean }>;
        const ids = items.map((i) => i.id).sort();

        expect(ids).toEqual([globalArchivedId, globalPublishedId, tournamentPublishedId].sort());
        expect(ids).not.toContain(globalDraftId);
        expect(ids).not.toContain(foreignPublishedId);

        const archived = items.find((i) => i.id === globalArchivedId)!;
        expect(archived.status).toBe("ARCHIVED");
        expect(archived.usable).toBe(false);

        const published = items.find((i) => i.id === globalPublishedId)!;
        expect(published.usable).toBe(true);

        expect(data!.total).toBe(3);

        await transport.terminateSession();
        await client.close();
    });

    it("paginates", async () => {
        const { client, transport } = await connect(operatorToken);
        const { data } = await callTool(client, "list_questions", {
            tournamentId: pubTournamentId,
            limit: 2,
            offset: 0
        });

        expect((data!.items as unknown[]).length).toBe(2);
        expect(data!.total).toBe(3);

        await transport.terminateSession();
        await client.close();
    });

    it("filters by kind", async () => {
        const { client, transport } = await connect(operatorToken);
        const { data } = await callTool(client, "list_questions", {
            tournamentId: pubTournamentId,
            kind: "TEXT"
        });

        expect(data!.total).toBe(0);

        await transport.terminateSession();
        await client.close();
    });

    it("hides a PRIVATE tournament from an operator, exposes it to an admin", async () => {
        const operator = await connect(operatorToken);
        const op = await callTool(operator.client, "list_questions", {
            tournamentId: privateTournamentId
        });
        expect(op.isError).toBe(true);
        expect((op.data as { error: string }).error).toBe("NOT_FOUND");
        await operator.transport.terminateSession();
        await operator.client.close();

        const admin = await connect(adminToken);
        const ad = await callTool(admin.client, "list_questions", {
            tournamentId: privateTournamentId
        });
        expect(ad.isError).toBe(false);
        expect(ad.data!.total).toBe(3); // the tournament's tags: published, archived, published
        await admin.transport.terminateSession();
        await admin.client.close();
    });

    it("enforces the READ scope", async () => {
        const { client, transport } = await connect(announceToken);
        const { isError, data } = await callTool(client, "list_questions", {
            tournamentId: pubTournamentId
        });

        expect(isError).toBe(true);
        expect((data as { error: string }).error).toBe("FORBIDDEN");

        await transport.terminateSession();
        await client.close();
    });
});


describe("get_question", () => {
    it("returns an ARCHIVED question with usable=false", async () => {
        const { client, transport } = await connect(operatorToken);
        const { isError, data } = await callTool(client, "get_question", {
            tournamentId: pubTournamentId,
            questionId: globalArchivedId
        });

        expect(isError).toBe(false);
        expect(data!.status).toBe("ARCHIVED");
        expect(data!.usable).toBe(false);
        expect(data!.payload).toBeDefined();

        await transport.terminateSession();
        await client.close();
    });

    it("404s for a DRAFT and for another tournament's question", async () => {
        const { client, transport } = await connect(operatorToken);

        const draft = await callTool(client, "get_question", {
            tournamentId: pubTournamentId,
            questionId: globalDraftId
        });
        expect(draft.isError).toBe(true);
        expect((draft.data as { error: string }).error).toBe("NOT_FOUND");

        const foreign = await callTool(client, "get_question", {
            tournamentId: pubTournamentId,
            questionId: foreignPublishedId
        });
        expect(foreign.isError).toBe(true);
        expect((foreign.data as { error: string }).error).toBe("NOT_FOUND");

        await transport.terminateSession();
        await client.close();
    });
});


describe("eligible_questions", () => {
    it("excludes ARCHIVED and DRAFT, matching the assembly rule", async () => {
        const { client, transport } = await connect(operatorToken);
        const { isError, data } = await callTool(client, "eligible_questions", {
            tournamentId: pubTournamentId
        });

        expect(isError).toBe(false);
        const ids = (data!.items as Array<{ id: string }>).map((i) => i.id).sort();

        expect(ids).toEqual([globalPublishedId, tournamentPublishedId].sort());
        expect(ids).not.toContain(globalArchivedId);
        expect(data!.total).toBe(2);

        await transport.terminateSession();
        await client.close();
    });
});


describe("audit", () => {
    it("writes mcp_tool_call with the key id", async () => {
        const { client, transport } = await connect(operatorToken);
        await callTool(client, "list_questions", { tournamentId: pubTournamentId });
        await transport.terminateSession();
        await client.close();

        const rows = await db
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.action, "mcp_tool_call"));

        const mine = rows.filter(
            (r) => (r.details as Record<string, unknown> | null)?.mcpKeyId === operatorKeyId
        );
        expect(mine.length).toBeGreaterThan(0);

        const listRows = mine.filter(
            (r) => (r.details as Record<string, unknown>)?.tool === "list_questions"
        );
        expect(listRows.length).toBeGreaterThan(0);
    });

    it("updates last_used_at on each call", async () => {
        const before = Date.now();
        const { client, transport } = await connect(operatorToken);
        await callTool(client, "list_questions", { tournamentId: pubTournamentId });
        await transport.terminateSession();
        await client.close();

        const [row] = await db.select().from(mcpKeys).where(eq(mcpKeys.id, operatorKeyId));
        expect(row.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
});
