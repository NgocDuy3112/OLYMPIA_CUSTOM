import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { createTournament } from "../../src/modules/tournaments/index.js";
import {
    createQuestion,
    getQuestion,
    listForAssembly,
    listQuestions,
    transitionQuestion,
    updateQuestion,
    type CreateQuestionInput
} from "../../src/modules/questions/index.js";


afterAll(async () => {
    await db.$client.end();
});

let adminId: string;
let ownerId: string;
let otherId: string;
let tournamentId: string;
let otherTournamentId: string;

const page = { limit: 50, offset: 0 };

const mc = (text = "2 + 2?"): CreateQuestionInput => ({
    kind: "MC",
    questionText: text,
    tag: "THTH",
    payload: { options: [{ id: "A", text: "4" }, { id: "B", text: "5" }], correctSet: ["A"] }
});

const tournamentInput = (slug: string) => ({
    name: "Service Host",
    slug,
    defaultTags: ["THTH"],
    defaultRounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    defaultFormat: {
        competitorsPerMatch: 4,
        allowedSeatKinds: ["user" as const],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    defaultPlacementTiers: [{ min: 1, max: 4, points: 10 }]
});

async function publish(id: string): Promise<void> {
    await transitionQuestion(id, "PENDING", "ADMIN");
    await transitionQuestion(id, "PUBLISHED", "ADMIN");
}

beforeAll(async () => {
    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "qs-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "qs-owner", displayName: "Owner" },
            { role: "OPERATOR", username: "qs-other", displayName: "Other" }
        ])
        .returning({ id: users.id });

    adminId = rows[0].id;
    ownerId = rows[1].id;
    otherId = rows[2].id;

    tournamentId = (await createTournament(tournamentInput("qs-cup-a"), ownerId)).id;
    otherTournamentId = (await createTournament(tournamentInput("qs-cup-b"), otherId)).id;
});


describe("createQuestion", () => {
    it("always creates as DRAFT and records the actor and scope", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("draft one"));

        expect(row.status).toBe("DRAFT");
        expect(row.createdBy).toBe(ownerId);
        expect(row.tournamentId).toBe(tournamentId);
    });

    it("accepts any tag in the global bank", async () => {
        const row = await createQuestion({ tournamentId: null, actorId: ownerId }, { ...mc("global"), tag: "ANYTHING" });

        expect(row.tournamentId).toBeNull();
        expect(row.tag).toBe("ANYTHING");
    });

    it("rejects a tag outside the tournament's tags", async () => {
        await expect(
            createQuestion({ tournamentId, actorId: ownerId }, { ...mc("bad tag"), tag: "NOPE" })
        ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("rejects a payload that does not match the kind", async () => {
        await expect(
            createQuestion(
                { tournamentId, actorId: ownerId },
                { ...mc("mismatch"), payload: { acceptedAnswers: ["x"], normalize: { caseSensitive: false, trim: true, stripAccents: true } } }
            )
        ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("404s when the tournament does not exist", async () => {
        await expect(
            createQuestion({ tournamentId: "00000000-0000-4000-8000-000000000000", actorId: ownerId }, mc())
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
});


describe("getQuestion", () => {
    it("returns the row within its scope", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("scoped read"));
        const found = await getQuestion(row.id, { tournamentId });

        expect(found.id).toBe(row.id);
    });

    it("404s on a scope mismatch", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("wrong scope"));

        await expect(getQuestion(row.id, { tournamentId: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(getQuestion(row.id, { tournamentId: otherTournamentId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("404s for an unknown id", async () => {
        await expect(getQuestion("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
            code: "NOT_FOUND"
        });
    });
});


describe("updateQuestion", () => {
    it("edits content while the question is not archived", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("before"));
        const updated = await updateQuestion(row.id, { questionText: "after" });

        expect(updated.questionText).toBe("after");
    });

    it("re-checks payload integrity against the existing kind", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("integrity"));

        await expect(
            updateQuestion(row.id, { payload: { options: [{ id: "A", text: "4" }], correctSet: ["Z"] } })
        ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("refuses to edit an archived question", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("archived edit"));
        await transitionQuestion(row.id, "ARCHIVED", "ADMIN");

        await expect(updateQuestion(row.id, { questionText: "too late" })).rejects.toMatchObject({
            code: "IMMUTABLE"
        });
    });
});


describe("transitionQuestion", () => {
    it("supports the reject path PENDING → ARCHIVED", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("reject me"));

        const pending = await transitionQuestion(row.id, "PENDING", "OPERATOR");
        expect(pending.status).toBe("PENDING");

        const rejected = await transitionQuestion(row.id, "ARCHIVED", "OPERATOR");
        expect(rejected.status).toBe("ARCHIVED");
    });

    it("only an ADMIN may publish", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("gate"));
        await transitionQuestion(row.id, "PENDING", "OPERATOR");

        await expect(transitionQuestion(row.id, "PUBLISHED", "OPERATOR")).rejects.toMatchObject({
            code: "FORBIDDEN"
        });

        const published = await transitionQuestion(row.id, "PUBLISHED", "ADMIN");
        expect(published.status).toBe("PUBLISHED");
    });

    it("is a no-op for the same status (no write)", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("noop"));
        const same = await transitionQuestion(row.id, "DRAFT", "ADMIN");

        expect(same.updatedAt.getTime()).toBe(row.updatedAt.getTime());
    });

    it("rejects illegal transitions", async () => {
        const row = await createQuestion({ tournamentId, actorId: ownerId }, mc("illegal"));
        await publish(row.id);

        await expect(transitionQuestion(row.id, "DRAFT", "ADMIN")).rejects.toMatchObject({
            code: "INVALID_TRANSITION"
        });

        await transitionQuestion(row.id, "ARCHIVED", "ADMIN");
        await expect(transitionQuestion(row.id, "PUBLISHED", "ADMIN")).rejects.toMatchObject({
            code: "INVALID_TRANSITION"
        });
    });
});


describe("listQuestions — scope semantics", () => {
    it("null = global bank only; undefined = every scope", async () => {
        await createQuestion({ tournamentId: null, actorId: ownerId }, { ...mc("scope global"), tag: "GLOBAL" });
        const scoped = await createQuestion({ tournamentId, actorId: ownerId }, mc("scope local"));

        const globalOnly = await listQuestions({ tournamentId: null }, page);
        expect(globalOnly.items.every((q) => q.tournamentId === null)).toBe(true);

        const everyScope = await listQuestions({}, page);
        expect(everyScope.total).toBeGreaterThan(globalOnly.total);

        const thisTournament = await listQuestions({ tournamentId }, page);
        expect(thisTournament.items.map((q) => q.id)).toContain(scoped.id);
    });
});


describe("listForAssembly — the visibility choke point", () => {
    it("returns PUBLISHED questions from the global bank and the given tournament only", async () => {
        const globalPublished = await createQuestion({ tournamentId: null, actorId: ownerId }, { ...mc("asm global"), tag: "GLOBAL" });
        await publish(globalPublished.id);

        const ownPublished = await createQuestion({ tournamentId, actorId: ownerId }, mc("asm own"));
        await publish(ownPublished.id);

        const ownDraft = await createQuestion({ tournamentId, actorId: ownerId }, mc("asm draft"));
        const ownPending = await createQuestion({ tournamentId, actorId: ownerId }, mc("asm pending"));
        await transitionQuestion(ownPending.id, "PENDING", "OPERATOR");
        const ownArchived = await createQuestion({ tournamentId, actorId: ownerId }, mc("asm archived"));
        await transitionQuestion(ownArchived.id, "ARCHIVED", "OPERATOR");

        const foreignPublished = await createQuestion({ tournamentId: otherTournamentId, actorId: otherId }, mc("asm foreign"));
        await publish(foreignPublished.id);

        const ids = (await listForAssembly(tournamentId)).map((q) => q.id);

        expect(ids).toContain(globalPublished.id);
        expect(ids).toContain(ownPublished.id);
        expect(ids).not.toContain(ownDraft.id);
        expect(ids).not.toContain(ownPending.id);
        expect(ids).not.toContain(ownArchived.id);
        expect(ids).not.toContain(foreignPublished.id);
    });
});
