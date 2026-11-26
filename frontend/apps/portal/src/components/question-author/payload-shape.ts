export type PayloadShape = "choice" | "keyword" | "text"
export type QuestionKind = "TEXT" | "KEYWORD"

export interface QuestionMedia {
    url: string
    type: "image" | "audio" | "video"
}

export interface AuthorDraft {
    bucket: string
    questionText: string
    accepted: string
    options: Array<{ id: string; text: string }>
    correct: string[]
    code: string
    keywordId: string
    media: QuestionMedia | null
}

export interface AuthorSave {
    kind: QuestionKind
    questionText: string
    keywordId: string | null
    payload: Record<string, unknown>
    tags: string[]
    media: QuestionMedia | null
}

export interface AuthorRow {
    kind?: string
    questionText: string
    keywordId?: string | null
    payload?: Record<string, unknown>
    tags?: string[]
    media?: QuestionMedia | null
}

export const HINT_MAX = 8

interface BucketChoice {
    value: string
    label: string
}

export const BUCKET_GROUPS: Array<{ group: string; choices: BucketChoice[] }> = [
    {
        group: "Khởi động",
        choices: [
            { value: "khoi-dong:rieng", label: "Riêng" },
            { value: "khoi-dong:chung", label: "Chung" },
        ],
    },
    { group: "Giải mã", choices: [{ value: "giai-ma", label: "Từ khóa" }] },
    { group: "Bứt phá", choices: [{ value: "but-pha", label: "Bứt phá" }] },
    {
        group: "Câu hỏi phụ",
        choices: [{ value: "cau-hoi-phu", label: "Câu hỏi phụ" }],
    },
    {
        group: "Về đích",
        choices: [
            { value: "ve-dich:20", label: "20 điểm" },
            { value: "ve-dich:30", label: "30 điểm" },
            { value: "ve-dich:40", label: "40 điểm" },
            { value: "ve-dich:50", label: "50 điểm" },
        ],
    },
]

export const BUCKET_VALUES = new Set(BUCKET_GROUPS.flatMap((g) => g.choices.map((c) => c.value)))

export function payloadShapeOf(bucket: string, linked: boolean): PayloadShape {
    if (linked) return "text"
    switch (bucket) {
        case "khoi-dong:rieng":
        case "ve-dich:40":
        case "ve-dich:50":
            return "choice"
        case "giai-ma":
            return "keyword"
        default:
            return "text"
    }
}

export function kindFor(shape: PayloadShape, keywordId: string): QuestionKind {
    if (keywordId) return "TEXT"
    if (shape === "keyword") return "KEYWORD"
    return "TEXT"
}

export function nextOptionId(existing: string[]): string {
    for (let i = 0; i < 26; i += 1) {
        const id = String.fromCharCode(97 + i)
        if (!existing.includes(id)) return id
    }
    return `o${existing.length}`
}

export function draftFrom(row: AuthorRow | null | undefined, bucket?: string, presetKeywordId?: string): AuthorDraft {
    const base: AuthorDraft = {
        bucket: bucket ?? "",
        questionText: row?.questionText ?? "",
        accepted: "",
        options: [
            { id: "a", text: "" },
            { id: "b", text: "" },
        ],
        correct: [],
        code: "",
        keywordId: row?.keywordId ?? presetKeywordId ?? "",
        media: row?.media ?? null,
    }
    if (!base.bucket && (presetKeywordId || row?.keywordId != null)) base.bucket = "giai-ma"
    if (!base.bucket && row) {
        let carried = (row.tags ?? []).find((tag) => BUCKET_VALUES.has(tag))
        if (carried === undefined) {
            const carrier = row.payload?.bucket
            if (typeof carrier === "string") {
                if (BUCKET_VALUES.has(carrier)) carried = carrier
            }
        }
        if (carried) base.bucket = carried
    }
    if (!row?.payload) return base
    const payload = row.payload
    if (Array.isArray(payload.options)) {
        base.options = (payload.options as Array<{ id: string; text: string }>).map((o) => ({
            id: o.id,
            text: o.text,
        }))
        base.correct = []
        if (Array.isArray(payload.correctSet)) base.correct = [...(payload.correctSet as string[])]
    }
    if (Array.isArray(payload.acceptedAnswers)) {
        base.accepted = (payload.acceptedAnswers as string[]).join("\n")
    }
    if (typeof payload.code === "string") base.code = payload.code
    return base
}

export function buildPayload(shape: PayloadShape, draft: AuthorDraft): Record<string, unknown> | null {
    if (shape === "keyword") {
        if (!draft.code.trim()) return null
        return { code: draft.code.trim() }
    }
    const acceptedAnswers = draft.accepted
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    if (acceptedAnswers.length === 0) return null
    if (shape === "text") return { acceptedAnswers }
    const options = draft.options
        .filter((o) => o.text.trim())
        .map((o) => ({ id: o.id, text: o.text.trim() }))
    if (options.length < 2) return null
    const ids = new Set(options.map((o) => o.id))
    const correct = draft.correct.filter((id) => ids.has(id))
    if (correct.length !== 1) return null
    return { acceptedAnswers, options, correctSet: correct }
}

export function stripBridge(value: Record<string, unknown>): Record<string, unknown> {
    const rest = { ...value }
    delete rest.type
    delete rest.bucket
    return rest
}

export function reasonFor(shape: PayloadShape): string {
    if (shape === "choice") {
        return "This group needs an answer line, at least 2 options and exactly one correct choice (the audience face)."
    }
    if (shape === "keyword") return "A keyword needs its code."
    return "This group needs at least one accepted answer (one per line)."
}
