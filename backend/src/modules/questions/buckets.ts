import { QuestionError } from "./errors.js";

export type QuestionType = "TEXT" | "ORAL" | "CHOICE" | "KEYWORD";

export const QUESTION_TYPES: readonly QuestionType[] = ["TEXT", "ORAL", "CHOICE", "KEYWORD"] as const;

export const BUCKET_TYPE = {
    "khoi-dong:rieng": "ORAL",
    "khoi-dong:chung": "TEXT",
    "giai-ma": "KEYWORD",
    "but-pha": "TEXT",
    "ve-dich:20": "TEXT",
    "ve-dich:30": "TEXT",
    "ve-dich:40": "ORAL",
    "ve-dich:50": "ORAL"
} as const;

export type BucketTag = keyof typeof BUCKET_TYPE;

export const ALL_BUCKETS = Object.keys(BUCKET_TYPE) as BucketTag[];

const BUCKET_KEYS = new Set<string>(ALL_BUCKETS);

export function isBucketTag(tag: string): tag is BucketTag {
    return BUCKET_KEYS.has(tag);
}

export function bucketOfTags(tags: readonly string[] | null | undefined): BucketTag | null {
    if (!tags) return null;
    for (const tag of tags) {
        if (isBucketTag(tag)) return tag;
    }
    return null;
}

export function requireBucketTag(tags: readonly string[] | null | undefined): BucketTag {
    const found: BucketTag[] = [];
    for (const tag of tags ?? []) {
        if (isBucketTag(tag)) found.push(tag);
    }
    if (found.length === 0) {
        throw new QuestionError(
            "VALIDATION",
            "a question carries exactly one bucket tag",
            [`expected one of: ${ALL_BUCKETS.join(", ")}`]
        );
    }
    if (found.length > 1) {
        throw new QuestionError(
            "VALIDATION",
            "a question carries exactly one bucket tag",
            [`found: ${found.join(", ")}`]
        );
    }
    return found[0];
}


export interface Slot {
    roundId: string;
    turnId?: string;
    points?: number;
}

const MAPPED_ROUNDS = new Set(["khoi-dong", "giai-ma", "but-pha", "ve-dich"]);

export function expandBucketParam(value: string): string[] {
    const matches = ALL_BUCKETS.filter(
        (bucket) => bucket === value || bucket.startsWith(`${value}:`)
    );
    if (matches.length === 0) {
        throw new QuestionError("VALIDATION", `unknown bucket "${value}"`, [
            `expected a round (${[...new Set(ALL_BUCKETS.map((bucket) => bucket.split(":")[0]))].join(", ")}) or a full bucket`,
        ]);
    }
    return matches;
}

export function slotForBucket(bucket: string): Slot {
    switch (bucket) {
        case "khoi-dong:rieng":
            return { roundId: "khoi-dong", turnId: "phase1" };
        case "khoi-dong:chung":
            return { roundId: "khoi-dong", turnId: "phase2" };
        case "giai-ma":
            return { roundId: "giai-ma", turnId: "phase1" };
        case "but-pha":
            return { roundId: "but-pha", turnId: "phase1" };
        case "ve-dich:20":
            return { roundId: "ve-dich", turnId: "phase1", points: 20 };
        case "ve-dich:30":
            return { roundId: "ve-dich", turnId: "phase1", points: 30 };
        case "ve-dich:40":
            return { roundId: "ve-dich", turnId: "phase2", points: 40 };
        case "ve-dich:50":
            return { roundId: "ve-dich", turnId: "phase2", points: 50 };
        default:
            throw new QuestionError("VALIDATION", `no match slot for bucket "${bucket}"`, [
                `expected one of: ${ALL_BUCKETS.join(", ")}`
            ]);
    }
}

export function expectedBucketForSlot(slot: Slot): BucketTag {
    switch (slot.roundId) {
        case "khoi-dong":
            if (slot.turnId === "phase1") return "khoi-dong:rieng";
            if (slot.turnId === "phase2") return "khoi-dong:chung";
            throw new QuestionError(
                "VALIDATION",
                `no bucket mapping for khoi-dong turn "${slot.turnId ?? "?"}"`
            );
        case "giai-ma":
            return "giai-ma";
        case "but-pha":
            return "but-pha";
        case "ve-dich": {
            const points = slot.points;
            if (points === 20 || points === 30 || points === 40 || points === 50) {
                return `ve-dich:${points}` as BucketTag;
            }
            throw new QuestionError(
                "VALIDATION",
                "a ve-dich entry needs its cell points (20, 30, 40 or 50)"
            );
        }
        default:
            throw new QuestionError(
                "VALIDATION",
                `round "${slot.roundId}" has no bucket mapping`
            );
    }
}

export function expectedTypesForSlot(
    bucket: BucketTag,
    source: { keywordLinked?: boolean } = {}
): QuestionType[] {
    if (bucket === "giai-ma") {
        return source.keywordLinked ? ["TEXT"] : ["KEYWORD"];
    }
    return [BUCKET_TYPE[bucket]];
}


interface PayloadShape {
    type?: unknown;
    acceptedAnswers?: unknown;
    normalize?: unknown;
    options?: unknown;
    correctSet?: unknown;
    code?: unknown;
}

function fail(message: string, details: string[] = []): never {
    throw new QuestionError("VALIDATION", message, details);
}

function requireAccepted(p: PayloadShape, type: QuestionType): void {
    if (!Array.isArray(p.acceptedAnswers) || p.acceptedAnswers.length === 0) {
        fail(`${type} questions require payload.acceptedAnswers (one entry is enough)`);
    }
    if (p.acceptedAnswers.some((answer) => typeof answer !== "string" || answer.trim() === "")) {
        fail(`${type} questions require non-empty strings in payload.acceptedAnswers`);
    }
    if (typeof p.normalize !== "object" || p.normalize === null) {
        fail(`${type} questions require payload.normalize`);
    }
}

function requireChoices(p: PayloadShape, opts: { minOptions: number; exactlyOneCorrect: boolean }): void {
    if (!Array.isArray(p.options) || p.options.length < opts.minOptions) {
        fail(
            `payload.options needs at least ${opts.minOptions} entries` +
                (opts.exactlyOneCorrect ? " — the audience picks exactly one" : "")
        );
    }
    const options = p.options as Array<{ id?: unknown; text?: unknown }>;
    const ids = options.map((option) => option.id);
    if (ids.some((id) => typeof id !== "string" || id === "")) {
        fail("every payload option needs a non-empty string id");
    }
    if (new Set(ids as string[]).size !== ids.length) {
        fail("payload option ids must be unique");
    }
    if (!Array.isArray(p.correctSet) || p.correctSet.length === 0) {
        fail("payload.correctSet must name the correct option(s)");
    }
    const correct = p.correctSet as unknown[];
    if (opts.exactlyOneCorrect && correct.length !== 1) {
        fail("payload.correctSet must name exactly one correct choice");
    }
    const unknownIds = correct.filter((id) => !(ids as string[]).includes(id as string));
    if (unknownIds.length > 0) {
        fail(
            "payload.correctSet must reference existing option ids",
            unknownIds.map((id) => `unknown option id "${String(id)}"`)
        );
    }
}

export function assertPayloadForType(type: QuestionType, payload: unknown): void {
    if (!QUESTION_TYPES.includes(type)) {
        fail(`unknown question type "${String(type)}"`, [`expected: ${QUESTION_TYPES.join(", ")}`]);
    }
    const p = (payload ?? {}) as PayloadShape;
    if (p.type !== undefined && p.type !== type) {
        fail(`payload.type "${String(p.type)}" does not match the question type "${type}"`);
    }
    switch (type) {
        case "TEXT":
            requireAccepted(p, type);
            return;
        case "ORAL":
            requireAccepted(p, type);
            requireChoices(p, { minOptions: 2, exactlyOneCorrect: true });
            return;
        case "CHOICE":
            requireChoices(p, { minOptions: 1, exactlyOneCorrect: false });
            return;
        case "KEYWORD":
            if (typeof p.code !== "string" || p.code.trim() === "") {
                fail("KEYWORD questions require a non-empty payload.code");
            }
            if (typeof p.normalize !== "object" || p.normalize === null) {
                fail("KEYWORD questions require payload.normalize");
            }
            return;
    }
}

export function payloadWithType<T extends Record<string, unknown>>(
    type: QuestionType,
    payload: T
): T & { type: QuestionType } {
    return { ...payload, type };
}

export function assertHintLink(type: QuestionType, keywordId: string | null | undefined): void {
    if (keywordId && keywordId !== "" && type !== "TEXT") {
        throw new QuestionError(
            "VALIDATION",
            "a linked hint must be a TEXT question",
            [`type is ${type}`]
        );
    }
}


export interface SlotConflictSource {
    tags?: readonly string[] | null;
    type?: string | null;
    keywordId?: string | null;
}

export function slotConflict(slot: Slot, source: SlotConflictSource): string | null {
    if (!MAPPED_ROUNDS.has(slot.roundId)) return null;

    let expected: BucketTag;
    try {
        expected = expectedBucketForSlot(slot);
    } catch (error) {
        return error instanceof QuestionError ? error.message : String(error);
    }

    const where =
        slot.roundId === "ve-dich"
            ? `${slot.roundId} cell ${slot.points ?? "?"}`
            : `${slot.roundId}/${slot.turnId ?? "?"}`;

    const bucket = bucketOfTags(source.tags ?? []);
    if (!bucket) {
        return null;
    }
    if (bucket !== expected) {
        return `bucket ${bucket} does not fit slot ${where} (expected ${expected})`;
    }

    const rawType = source.type ?? null;
    if (rawType === null) {
        return null;
    }
    const types = expectedTypesForSlot(bucket, { keywordLinked: Boolean(source.keywordId) });
    if (!QUESTION_TYPES.includes(rawType as QuestionType)) {
        return `unknown question type "${rawType}"`;
    }
    if (!types.includes(rawType as QuestionType)) {
        return `type ${rawType} does not fit slot ${where} (expected ${types.join(" or ")})`;
    }
    return null;
}


export function audienceFace(
    payload: unknown
): Array<{ id: string; text: string }> | null {
    const options = (payload as PayloadShape | null)?.options;
    if (!Array.isArray(options) || options.length === 0) return null;
    const face: Array<{ id: string; text: string }> = [];
    for (const option of options) {
        const candidate = option as { id?: unknown; text?: unknown };
        if (typeof candidate.id !== "string" || typeof candidate.text !== "string") return null;
        face.push({ id: candidate.id, text: candidate.text });
    }
    return face;
}
