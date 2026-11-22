import { Archive, EyeOff, Globe, Pencil } from "lucide-react"
import { ApiError } from "@shared/lib/api"

export type Kind = "CHOICE" | "TEXT" | "KEYWORD"
export type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED"

export interface QuestionUsageItem {
    id: string
    tournamentId: string
    label: string
    stageId: string
    status: string
}

export interface BankQuestion {
    id: string
    kind: Kind
    questionText: string
    keywordId?: string | null
    status: Status
    tags?: string[]
    payload: Record<string, unknown>
    updatedAt: string
    assignedMatches?: QuestionUsageItem[]
}

export interface Paged {
    items: BankQuestion[]
    total: number
}

export const PAGE_SIZE = 30
export const HINT_MAX = 8
export const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

export const STATUS_LABEL: Record<Status, string> = {
    DRAFT: "Draft",
    PUBLISHED: "Published",
    ARCHIVED: "Archived",
}

export const TRANSITIONS: Record<Status, Array<{ to: Status; label: string; adminOnly?: boolean }>> = {
    DRAFT: [
        { to: "PUBLISHED", label: "Publish", adminOnly: true },
        { to: "ARCHIVED", label: "Archive" },
    ],
    PUBLISHED: [
        { to: "DRAFT", label: "Unpublish" },
        { to: "ARCHIVED", label: "Archive" },
    ],
    ARCHIVED: [],
}

export const TRANSITION_ICON: Record<string, typeof Pencil> = {
    Publish: Globe,
    Unpublish: EyeOff,
    Archive: Archive,
}

export type TabId = "khoi-dong" | "giai-ma" | "but-pha" | "ve-dich"

export interface GroupDef {
    bucket: string | null
    label: string
}

export interface TabDef {
    id: TabId
    label: string
    groups: GroupDef[]
}

export const TABS: TabDef[] = [
    {
        id: "khoi-dong",
        label: "Khởi động",
        groups: [
            { bucket: "khoi-dong:rieng", label: "Riêng" },
            { bucket: "khoi-dong:chung", label: "Chung" },
        ],
    },
    {
        id: "giai-ma",
        label: "Giải mã",
        groups: [{ bucket: "giai-ma", label: "Từ khóa" }],
    },
    {
        id: "but-pha",
        label: "Bứt phá",
        groups: [{ bucket: "but-pha", label: "Bứt phá" }],
    },
    {
        id: "ve-dich",
        label: "Về đích",
        groups: [
            { bucket: "ve-dich:20", label: "20 điểm" },
            { bucket: "ve-dich:30", label: "30 điểm" },
            { bucket: "ve-dich:40", label: "40 điểm" },
            { bucket: "ve-dich:50", label: "50 điểm" },
        ],
    },
]

export const UNASSIGNED: GroupDef = { bucket: null, label: "Chưa gán nhóm" }

export const BUCKET_TAGS = new Set(
    TABS.flatMap((tab) => tab.groups.map((group) => group.bucket)).filter(
        (bucket): bucket is string => bucket !== null
    )
)

export function activeTab(id: TabId): TabDef {
    return TABS.find((tab) => tab.id === id) ?? TABS[0]
}

export function bucketOf(row: BankQuestion): string | null {
    const tagged = (row.tags ?? []).find((tag) => BUCKET_TAGS.has(tag))
    if (tagged) return tagged
    const carrier = (row.payload as { bucket?: unknown }).bucket
    if (typeof carrier === "string" && carrier.length > 0) return carrier
    if (row.kind === "KEYWORD") return "giai-ma"
    if (row.kind === "TEXT" && row.keywordId != null) return "giai-ma"
    return null
}

export function shapeOf(row: BankQuestion): string {
    const payload = row.payload as { options?: unknown; code?: unknown }
    if (Array.isArray(payload.options)) return "CHOICE"
    if (typeof payload.code === "string") return "KEYWORD"
    return "TEXT"
}

export function belongsToTab(bucket: string | null, tab: TabId): boolean {
    if (!bucket) return false
    return bucket === tab || bucket.startsWith(`${tab}:`)
}

export const STATUSES: Status[] = ["DRAFT", "PUBLISHED", "ARCHIVED"]

export interface UrlState {
    tab: TabId
    status: Status | "ALL"
    search: string
    page: number
}

export function readUrlState(): UrlState {
    const fallback: UrlState = { tab: "khoi-dong", status: "ALL", search: "", page: 1 }
    if (typeof window === "undefined") return fallback
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab") ?? params.get("kind") ?? "khoi-dong"
    const status = params.get("status") ?? "ALL"
    const legacy: Record<string, TabId> = { KEYWORD: "giai-ma", TEXT: "khoi-dong", CHOICE: "khoi-dong" }
    let mapped: TabId = legacy[tab] ?? "khoi-dong"
    if ((TABS as TabDef[]).some((entry) => entry.id === tab)) mapped = tab as TabId
    let initialStatus: Status | "ALL" = "ALL"
    if ((STATUSES as string[]).includes(status)) initialStatus = status as Status
    let page = Number(params.get("page") ?? "1")
    if (!Number.isInteger(page)) page = 1
    if (page < 1) page = 1
    return {
        tab: mapped,
        status: initialStatus,
        search: params.get("search") ?? "",
        page,
    }
}

export function listParams(state: UrlState): URLSearchParams {
    const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((state.page - 1) * PAGE_SIZE),
        bucket: state.tab,
    })
    if (state.status !== "ALL") params.set("status", state.status)
    if (state.search) params.set("search", state.search)
    return params
}

export function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Something went wrong. Please try again."
}

export function answerSummary(row: BankQuestion): string | null {
    const payload = row.payload as {
        acceptedAnswers?: string[]
        options?: Array<{ id: string; text: string }>
        correctSet?: string[]
        code?: string
    }
    if (row.kind === "TEXT") {
        const answers = payload.acceptedAnswers ?? []
        if (answers.length > 0) return `→ ${answers.join(" · ")}`
        return null
    }
    if (row.kind === "CHOICE") {
        const text = new Map((payload.options ?? []).map((option) => [option.id, option.text]))
        const correct = (payload.correctSet ?? [])
            .map((id) => text.get(id))
            .filter((value): value is string => Boolean(value))
        if (correct.length > 0) return `→ ${correct.join(" · ")}`
        return "→ No correct option ticked"
    }
    if (payload.code) return `→ ${payload.code}`
    return null
}

export function bucketLabel(bucket: string | null): string | null {
    if (!bucket) return null
    for (const tabDef of TABS) {
        for (const group of tabDef.groups) {
            if (group.bucket === bucket) return `${tabDef.label} · ${group.label}`
        }
    }
    return bucket
}

export function groupLabelOf(bucket: string | null): string | null {
    if (!bucket) return null
    for (const tabDef of TABS) {
        for (const group of tabDef.groups) {
            if (group.bucket === bucket) return group.label
        }
    }
    return bucket
}
