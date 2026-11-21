import { ApiError } from "@shared/lib/api"
import type { RoundConfig } from "@/lib/tournament"
import type { ComposeRow } from "@/components/compose-group"

export interface FrozenQuestion {
    _id?: string
    roundId: string
    turnId: string
    position?: number
    kind?: string
    questionText: string
    points?: number
    payload?: Record<string, unknown>
    sourceId?: string
}

export interface Entry {
    roundId: string
    turnId: string
    sourceId: string
    points?: number
    questionText?: string
    kind?: string
    keywordId?: string | null
    badge?: string
    position?: number
}

export interface BankRow {
    id: string
    kind: string
    questionText: string
    keywordId?: string | null
    tags?: string[]
    payload?: Record<string, unknown>
}

export interface GroupDef {
    bucket: string
    label: string
    typeLabel?: string
    roundId: string
    turnId: string
    points?: number
}

export interface TabDef {
    id: string
    label: string
    groups: GroupDef[]
}

export const TABS: TabDef[] = [
    {
        id: "khoi-dong",
        label: "Khởi động",
        groups: [
            { bucket: "khoi-dong:rieng", label: "Riêng", typeLabel: "ORAL", roundId: "khoi-dong", turnId: "phase1" },
            { bucket: "khoi-dong:chung", label: "Chung", typeLabel: "TEXT", roundId: "khoi-dong", turnId: "phase2" },
        ],
    },
    {
        id: "giai-ma",
        label: "Giải mã",
        groups: [{ bucket: "giai-ma", label: "Từ khóa", typeLabel: "KEYWORD", roundId: "giai-ma", turnId: "phase1" }],
    },
    {
        id: "but-pha",
        label: "Bứt phá",
        groups: [{ bucket: "but-pha", label: "Bứt phá", typeLabel: "TEXT", roundId: "but-pha", turnId: "phase1" }],
    },
    {
        id: "ve-dich",
        label: "Về đích",
        groups: [
            { bucket: "ve-dich:20", label: "20 điểm", typeLabel: "TEXT", roundId: "ve-dich", turnId: "phase1", points: 20 },
            { bucket: "ve-dich:30", label: "30 điểm", typeLabel: "TEXT", roundId: "ve-dich", turnId: "phase1", points: 30 },
            { bucket: "ve-dich:40", label: "40 điểm", typeLabel: "ORAL", roundId: "ve-dich", turnId: "phase2", points: 40 },
            { bucket: "ve-dich:50", label: "50 điểm", typeLabel: "ORAL", roundId: "ve-dich", turnId: "phase2", points: 50 },
        ],
    },
]

export const ALL_GROUPS = TABS.flatMap((tab) => tab.groups)
export const BUCKET_TAGS = new Set(ALL_GROUPS.map((group) => group.bucket))
export const VE_DICH_POINTS = new Set([20, 30, 40, 50])

export const BOARD_COMPOSITION: Record<number, number> = { 20: 6, 30: 6, 40: 4, 50: 4 }
export const DEFAULT_QUESTION_COUNTS: Record<string, Record<string, number>> = {
    "khoi-dong": { phase1: 6, phase2: 6 },
    "giai-ma": { phase1: 8 },
    "but-pha": { phase1: 4 },
}

export function requiredFor(
    group: GroupDef,
    rules: Record<string, RoundConfig> | null | undefined,
    playerCount = 1
): number {
    if (group.points !== undefined) return BOARD_COMPOSITION[group.points] ?? 0
    const fromRules = rules?.[group.roundId]?.turns.find((turn) => turn.id === group.turnId)?.questionCount
    let base = DEFAULT_QUESTION_COUNTS[group.roundId]?.[group.turnId] ?? 0
    if (typeof fromRules === "number") base = fromRules
    if (group.bucket === "khoi-dong:rieng") return base * Math.max(1, playerCount)
    return base
}

export function bucketOfEntry(question: { roundId: string; turnId?: string; points?: number }): string | null {
    switch (question.roundId) {
        case "khoi-dong":
            if (question.turnId === "phase1") return "khoi-dong:rieng"
            if (question.turnId === "phase2") return "khoi-dong:chung"
            return null
        case "giai-ma":
            return "giai-ma"
        case "but-pha":
            return "but-pha"
        case "ve-dich":
            if (question.points !== undefined) {
                if (VE_DICH_POINTS.has(question.points)) return `ve-dich:${question.points}`
            }
            return null
        default:
            return null
    }
}

export function bucketOfRow(row: BankRow): string | null {
    const tagged = (row.tags ?? []).find((tag) => BUCKET_TAGS.has(tag))
    if (tagged) return tagged
    const carrier = row.payload?.bucket
    if (typeof carrier === "string" && carrier.length > 0) return carrier
    if (row.kind === "KEYWORD") return "giai-ma"
    if (row.kind === "TEXT" && row.keywordId != null) return "giai-ma"
    return null
}

export function badgeOfRow(row: Pick<BankRow, "kind" | "payload" | "keywordId">): string {
    const declared = row.payload?.type
    if (typeof declared === "string" && declared.length > 0) return declared
    if (row.kind === "TEXT" && row.keywordId != null) return "Gợi ý"
    return row.kind
}

export function badgeOfFrozen(question: FrozenQuestion): string {
    const declared = question.payload?.type
    if (typeof declared === "string" && declared.length > 0) return declared
    if (question.kind === "KEYWORD") return "KEYWORD"
    if (question.kind === "TEXT" && question.roundId === "giai-ma") return "Gợi ý"
    return question.kind ?? "TEXT"
}

export function entryFromFrozen(question: FrozenQuestion, group?: GroupDef): Entry {
    const entry: Entry = {
        roundId: question.roundId,
        turnId: question.turnId,
        sourceId: question.sourceId ?? "",
        questionText: question.questionText,
        kind: question.kind,
        badge: badgeOfFrozen(question),
    }
    if (question.points !== undefined) entry.points = question.points
    if (question.position !== undefined) entry.position = question.position
    if (group?.points !== undefined && entry.points === undefined) entry.points = group.points
    return entry
}

export function bucketize(questions: FrozenQuestion[]): { groups: Record<string, Entry[]>; unplaced: Entry[] } {
    const groups: Record<string, Entry[]> = Object.fromEntries(ALL_GROUPS.map((group) => [group.bucket, []]))
    const unplaced: Entry[] = []
    for (const question of questions) {
        const bucket = bucketOfEntry(question)
        const entry = entryFromFrozen(question)
        if (!bucket || !entry.sourceId) unplaced.push(entry)
        else groups[bucket].push(entry)
    }
    return { groups, unplaced }
}

export function toComposeRows(entries: Entry[]): ComposeRow[] {
    const seen = new Map<string, number>()
    return entries.map((entry) => {
        const nth = (seen.get(entry.sourceId) ?? 0) + 1
        seen.set(entry.sourceId, nth)
        const bits: string[] = []
        if (entry.position !== undefined) bits.push(`#${entry.position + 1}`)
        if (entry.points !== undefined) bits.push(`${entry.points}đ`)
        const row: ComposeRow = {
            id: `${entry.sourceId}~${nth}`,
            primary: entry.questionText || entry.sourceId,
        }
        if (bits.length > 0) row.secondary = bits.join(" · ")
        if (entry.badge) row.badge = entry.badge
        return row
    })
}

export function flatten(groups: Record<string, Entry[]>): Entry[] {
    return ALL_GROUPS.flatMap((group) => groups[group.bucket] ?? [])
}

export function spliceInto(list: Entry[], index: number, entries: Entry[]): Entry[] {
    const next = [...list]
    next.splice(Math.max(0, Math.min(index, list.length)), 0, ...entries)
    return next
}

export function diffCount(current: Entry[], original: Entry[]): number {
    const tally = (entries: Entry[]) => {
        const map = new Map<string, number>()
        for (const entry of entries) {
            const key = `${entry.roundId}|${entry.turnId}|${entry.sourceId}`
            map.set(key, (map.get(key) ?? 0) + 1)
        }
        return map
    }
    const before = tally(original)
    const after = tally(current)
    let delta = 0
    for (const [key, count] of after) delta += Math.max(0, count - (before.get(key) ?? 0))
    for (const [key, count] of before) delta += Math.max(0, count - (after.get(key) ?? 0))
    return delta
}

export function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Có gì đó không ổn — thử lại."
}
