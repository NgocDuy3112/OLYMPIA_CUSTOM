import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
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

});


describe("createQuestion", () => {
    it("always creates as DRAFT and records the actor", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("draft one"));

        expect(row.status).toBe("DRAFT");
        expect(row.createdBy).toBe(ownerId);
    });

    it("accepts any tag in the global bank", async () => {
        const row = await createQuestion({ actorId: ownerId }, { ...mc("global"), tag: "ANYTHING" });

        expect(row.tag).toBe("ANYTHING");
    });

    it("accepts any tag in the global bank", async () => {
        const row = await createQuestion({ actorId: ownerId }, { ...mc("any tag"), tag: "ANYTHING" });
        expect(row.tag).toBe("ANYTHING");
    });

    it("rejects a payload that does not match the kind", async () => {
        await expect(
            createQuestion(
                { actorId: ownerId },
                { ...mc("mismatch"), payload: { acceptedAnswers: ["x"], normalize: { caseSensitive: false, trim: true, stripAccents: true } } }
            )
        ).rejects.toMatchObject({ code: "VALIDATION" });
    });

});


describe("getQuestion", () => {
    it("returns the row", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("a read"));
        const found = await getQuestion(row.id);

        expect(found.id).toBe(row.id);
    });

    it("404s for an unknown id", async () => {
        await expect(getQuestion("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
            code: "NOT_FOUND"
        });
    });
});


describe("updateQuestion", () => {
    it("edits content while the question is not archived", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("before"));
        const updated = await updateQuestion(row.id, { questionText: "after" });

        expect(updated.questionText).toBe("after");
    });

    it("re-checks payload integrity against the existing kind", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("integrity"));

        await expect(
            updateQuestion(row.id, { payload: { options: [{ id: "A", text: "4" }], correctSet: ["Z"] } })
        ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("refuses to edit an archived question", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("archived edit"));
        await transitionQuestion(row.id, "ARCHIVED", "ADMIN");

        await expect(updateQuestion(row.id, { questionText: "too late" })).rejects.toMatchObject({
            code: "IMMUTABLE"
        });
    });
});


describe("transitionQuestion", () => {
    it("supports the reject path PENDING → ARCHIVED", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("reject me"));

        const pending = await transitionQuestion(row.id, "PENDING", "OPERATOR");
        expect(pending.status).toBe("PENDING");

        const rejected = await transitionQuestion(row.id, "ARCHIVED", "OPERATOR");
        expect(rejected.status).toBe("ARCHIVED");
    });

    it("only an ADMIN may publish", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("gate"));
        await transitionQuestion(row.id, "PENDING", "OPERATOR");

        await expect(transitionQuestion(row.id, "PUBLISHED", "OPERATOR")).rejects.toMatchObject({
            code: "FORBIDDEN"
        });

        const published = await transitionQuestion(row.id, "PUBLISHED", "ADMIN");
        expect(published.status).toBe("PUBLISHED");
    });

    it("is a no-op for the same status (no write)", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("noop"));
        const same = await transitionQuestion(row.id, "DRAFT", "ADMIN");

        expect(same.updatedAt.getTime()).toBe(row.updatedAt.getTime());
    });

    it("rejects illegal transitions", async () => {
        const row = await createQuestion({ actorId: ownerId }, mc("illegal"));
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


describe("question search (tsvector + unaccent)", () => {
    const mcText = (text: string): CreateQuestionInput => ({
        kind: "MC",
        questionText: text,
        tag: "THTH",
        payload: { options: [{ id: "A", text: "4" }], correctSet: ["A"] }
    });

    it("matches accented text and unaccented queries alike", async () => {
        const row = await createQuestion(
            { actorId: ownerId },
            mcText("Đường lên đỉnh Olympia là gì?")
        );
        await publish(row.id);

        const accented = await listQuestions({ search: "Đường lên" }, page);
        expect(accented.items.map((q) => q.id)).toContain(row.id);

        // the point of unaccent: users type without diacritics
        const unaccented = await listQuestions({ search: "duong len dinh" }, page);
        expect(unaccented.items.map((q) => q.id)).toContain(row.id);
    });

    it("matches a partially typed last token (prefix)", async () => {
        const row = await createQuestion(
            { actorId: ownerId },
            mcText("Điện Biên Phủ được giải phóng năm nào?")
        );
        await publish(row.id);

        const typed = await listQuestions({ search: "dien bi" }, page);
        expect(typed.items.map((q) => q.id)).toContain(row.id);
    });

    it("combines search with structured filters", async () => {
        const matching = await createQuestion(
            { actorId: ownerId },
            mcText("Tìm kiếm chung MC")
        );
        const other = await createQuestion(
            { actorId: ownerId },
            {
                kind: "TEXT",
                questionText: "Tìm kiếm chung TEXT",
                tag: "THTH",
                payload: {
                    acceptedAnswers: ["x"],
                    normalize: { caseSensitive: false, trim: true, stripAccents: true }
                }
            }
        );
        await publish(matching.id);
        await publish(other.id);

        const textOnly = await listQuestions(
            { kind: "TEXT", search: "tim kiem chung" },
            page
        );

        const ids = textOnly.items.map((q) => q.id);
        expect(ids).toContain(other.id);
        expect(ids).not.toContain(matching.id);
    });

    it("returns nothing for a term that matches nothing (no false positives)", async () => {
        const res = await listQuestions(
            { search: "zzzznonexistentterm" },
            page
        );
        expect(res.total).toBe(0);
        expect(res.items).toHaveLength(0);
    });

    it("searches through the assembly-eligible read too", async () => {
        const own = await createQuestion(
            { actorId: ownerId },
            mcText("Eligible search inside the tournament")
        );
        const global = await createQuestion(
            { actorId: ownerId },
            mcText("Eligible search in the bank")
        );
        await publish(own.id);
        await publish(global.id);

        const res = await listForAssembly(["THTH"], { search: "eligible search" }, page);
        const ids = res.items.map((q) => q.id);

        expect(ids).toContain(own.id);
        expect(ids).toContain(global.id);
    });
});


describe("listQuestions — the bank", () => {
    it("lists every question of the global bank", async () => {
        await createQuestion({ actorId: ownerId }, { ...mc("one"), tag: "GLOBAL" });
        await createQuestion({ actorId: ownerId }, mc("two"));

        const every = await listQuestions({}, page);
        expect(every.total).toBeGreaterThan(0);
    });
});


describe("listForAssembly — the visibility choke point", () => {
    it("returns the PUBLISHED questions of the season's tags only", async () => {
        const globalPublished = await createQuestion({ actorId: ownerId }, { ...mc("asm global"), tag: "THTH" });
        await publish(globalPublished.id);

        const ownPublished = await createQuestion({ actorId: ownerId }, mc("asm own"));
        await publish(ownPublished.id);

        const ownDraft = await createQuestion({ actorId: ownerId }, mc("asm draft"));
        const ownPending = await createQuestion({ actorId: ownerId }, mc("asm pending"));
        await transitionQuestion(ownPending.id, "PENDING", "OPERATOR");
        const ownArchived = await createQuestion({ actorId: ownerId }, mc("asm archived"));
        await transitionQuestion(ownArchived.id, "ARCHIVED", "OPERATOR");

        // A question of another tag is not this season's to assemble.
        const foreignPublished = await createQuestion({ actorId: otherId }, { ...mc("asm foreign"), tag: "OTHER" });
        await publish(foreignPublished.id);

        const ids = (await listForAssembly(["THTH"], {}, { limit: 50, offset: 0 })).items.map((q) => q.id);

        expect(ids).toContain(globalPublished.id);
        expect(ids).toContain(ownPublished.id);
        expect(ids).not.toContain(ownDraft.id);
        expect(ids).not.toContain(ownPending.id);
        expect(ids).not.toContain(ownArchived.id);
        expect(ids).not.toContain(foreignPublished.id);
    });

    it("is paged and can filter by kind", async () => {
        const text = (name: string) =>
            createQuestion(
                { actorId: ownerId },
                {
                    kind: "TEXT",
                    questionText: name,
                    tag: "THTH",
                    payload: {
                        acceptedAnswers: ["x"],
                        normalize: { caseSensitive: false, trim: true, stripAccents: true }
                    }
                }
            );

        const first = await text("paged text A");
        const second = await text("paged text B");
        await publish(first.id);
        await publish(second.id);

        const page = await listForAssembly(["THTH"], { kinds: ["TEXT"] }, { limit: 1, offset: 0 });

        expect(Object.keys(page).sort()).toEqual(["items", "limit", "offset", "total"]);
        expect(page.items).toHaveLength(1);
        expect(page.limit).toBe(1);
        expect(page.total).toBeGreaterThanOrEqual(2);
        expect(page.items.every((q) => q.kind === "TEXT")).toBe(true);
    });
});
