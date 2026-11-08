import { useEffect, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, FileText, Lightbulb, Pencil, Plus, X } from "lucide-react"
import { cn } from "cn"
import { ApiError, api } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { EmptyState, ErrorPanel, ListSkeleton, Page, PageHeader } from "@/components/page"
import { QuestionAuthorDialog, type AuthorSave } from "@/components/question-author-dialog"
import { StagedImportBanner } from "@/components/staged-import"
import { useMe } from "@/lib/session"
import { useMatches } from "@/lib/tournament"
import { useTournaments } from "@/lib/tournaments"


type Kind = "CHOICE" | "TEXT" | "KEYWORD" | "HINT"
type Status = "DRAFT" | "PENDING" | "PUBLISHED" | "ARCHIVED"

interface BankQuestion {
    id: string
    kind: Kind
    questionText: string
    keywordId?: string | null
    status: Status
    timeLimit: number | null
    tags?: string[]
    payload: Record<string, unknown>
    updatedAt: string
}

interface Paged {
    items: BankQuestion[]
    total: number
}

interface BatchErrorRow {
    index: number
    code: string
    message: string
    details: string[]
}

interface BatchReport {
    dryRun: boolean
    total: number
    created: number
    ids: string[]
    errors: BatchErrorRow[]
}

interface ExcelRowSummary {
    index: number
    sheet: string
    sourceId: string
    bucket: string
    kind: string
}

interface ExcelReport extends BatchReport {
    skipped: number
    warnings: Array<{ index: number; message: string }>
    rows: ExcelRowSummary[]
}

const WINDOW = 500
const MAX_BATCH = 500
const HINT_MAX = 8
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })


const STATUS_LABEL: Record<Status, string> = {
    DRAFT: "Draft",
    PENDING: "In review",
    PUBLISHED: "Published",
    ARCHIVED: "Archived",
}

function StatusBadge({ status }: { status: Status }) {
    if (status === "ARCHIVED") {
        return <Badge variant="outline" className="line-through opacity-60">Archived</Badge>
    }
    const variant = status === "PUBLISHED" ? "default" : status === "PENDING" ? "secondary" : "outline"
    return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>
}

const TRANSITIONS: Record<Status, Array<{ to: Status; label: string; adminOnly?: boolean }>> = {
    DRAFT: [
        { to: "PENDING", label: "Submit" },
        { to: "ARCHIVED", label: "Archive" },
    ],
    PENDING: [
        { to: "PUBLISHED", label: "Publish", adminOnly: true },
        { to: "DRAFT", label: "Return" },
        { to: "ARCHIVED", label: "Archive" },
    ],
    PUBLISHED: [
        { to: "PENDING", label: "Unpublish" },
        { to: "ARCHIVED", label: "Archive" },
    ],
    ARCHIVED: [],
}



type TabId = "khoi-dong" | "giai-ma" | "but-pha" | "ve-dich"

interface GroupDef {
    bucket: string | null
    label: string
    typeLabel?: string
}

interface TabDef {
    id: TabId
    label: string
    groups: GroupDef[]
}

const TABS: TabDef[] = [
    {
        id: "khoi-dong",
        label: "Khởi động",
        groups: [
            { bucket: "khoi-dong:rieng", label: "Riêng", typeLabel: "ORAL" },
            { bucket: "khoi-dong:chung", label: "Chung", typeLabel: "TEXT" },
        ],
    },
    {
        id: "giai-ma",
        label: "Giải mã",
        groups: [{ bucket: "giai-ma", label: "Từ khóa", typeLabel: "KEYWORD" }],
    },
    {
        id: "but-pha",
        label: "Bứt phá",
        groups: [{ bucket: "but-pha", label: "Bứt phá", typeLabel: "TEXT" }],
    },
    {
        id: "ve-dich",
        label: "Về đích",
        groups: [
            { bucket: "ve-dich:20", label: "20 điểm", typeLabel: "TEXT" },
            { bucket: "ve-dich:30", label: "30 điểm", typeLabel: "TEXT" },
            { bucket: "ve-dich:40", label: "40 điểm", typeLabel: "ORAL" },
            { bucket: "ve-dich:50", label: "50 điểm", typeLabel: "ORAL" },
        ],
    },
]

const UNASSIGNED: GroupDef = { bucket: null, label: "Chưa gán nhóm" }

const BUCKET_TAGS = new Set(
    TABS.flatMap((tab) => tab.groups.map((group) => group.bucket)).filter(
        (bucket): bucket is string => bucket !== null
    )
)

function activeTab(id: TabId): TabDef {
    return TABS.find((tab) => tab.id === id) ?? TABS[0]
}

function bucketOf(row: BankQuestion): string | null {
    const tagged = (row.tags ?? []).find((tag) => BUCKET_TAGS.has(tag))
    if (tagged) return tagged
    const carrier = (row.payload as { bucket?: unknown }).bucket
    if (typeof carrier === "string" && carrier.length > 0) return carrier
    if (row.kind === "KEYWORD" || row.kind === "HINT") return "giai-ma"
    return null
}

function typeOf(row: BankQuestion): string {
    const declared = (row.payload as { type?: unknown }).type
    if (typeof declared === "string" && declared.length > 0) return declared
    return row.kind === "HINT" ? "TEXT" : row.kind
}

function belongsToTab(bucket: string | null, tab: TabId): boolean {
    if (!bucket) return false
    return bucket === tab || bucket.startsWith(`${tab}:`)
}

const STATUSES: Status[] = ["DRAFT", "PENDING", "PUBLISHED", "ARCHIVED"]

interface UrlState {
    tab: TabId
    status: Status | "ALL"
    search: string
}

function readUrlState(): UrlState {
    const fallback: UrlState = { tab: "khoi-dong", status: "ALL", search: "" }
    if (typeof window === "undefined") return fallback
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab") ?? params.get("kind") ?? "khoi-dong"
    const status = params.get("status") ?? "ALL"
    const legacy: Record<string, TabId> = { KEYWORD: "giai-ma", TEXT: "khoi-dong", CHOICE: "khoi-dong" }
    const mapped = (TABS as TabDef[]).some((entry) => entry.id === tab)
        ? (tab as TabId)
        : legacy[tab] ?? "khoi-dong"
    return {
        tab: mapped,
        status: (STATUSES as string[]).includes(status) ? (status as Status) : "ALL",
        search: params.get("search") ?? "",
    }
}

function listParams(state: UrlState): URLSearchParams {
    const params = new URLSearchParams({ limit: String(WINDOW), bucket: state.tab })
    if (state.status !== "ALL") params.set("status", state.status)
    if (state.search) params.set("search", state.search)
    return params
}


interface Normalize {
    caseSensitive: boolean
    trim: boolean
    stripAccents: boolean
}

function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Something went wrong. Please try again."
}

function normSummary(norm?: Partial<Normalize> | null): string {
    if (!norm) return "exact match"
    const parts = [norm.caseSensitive === false ? "case-insensitive" : "case-sensitive"]
    if (norm.trim !== false) parts.push("ignore surrounding spaces")
    if (norm.stripAccents) parts.push("ignore accents")
    return parts.join(" · ")
}

function answerSummary(row: BankQuestion): string | null {
    const payload = row.payload as {
        acceptedAnswers?: string[]
        options?: Array<{ id: string; text: string }>
        correctSet?: string[]
        code?: string
    }
    if (row.kind === "TEXT" || row.kind === "HINT") {
        const answers = payload.acceptedAnswers ?? []
        return answers.length > 0 ? `→ ${answers.join(" · ")}` : null
    }
    if (row.kind === "CHOICE") {
        const text = new Map((payload.options ?? []).map((option) => [option.id, option.text]))
        const correct = (payload.correctSet ?? [])
            .map((id) => text.get(id))
            .filter((value): value is string => Boolean(value))
        return correct.length > 0 ? `→ ${correct.join(" · ")}` : "→ ⚠ no correct option ticked"
    }
    return payload.code ? `→ ${payload.code}` : null
}


function RowActions({
    row,
    isAdmin,
    busy,
    onEdit,
    onTransition,
}: {
    row: BankQuestion
    isAdmin: boolean
    busy: boolean
    onEdit: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
}) {
    const [adding, setAdding] = useState(false)
    return (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
                variant="outline"
                size="sm"
                disabled={row.status === "ARCHIVED" || busy}
                title={row.status === "ARCHIVED" ? "Archived questions are immutable" : undefined}
                onClick={() => onEdit(row)}
            >
                <Pencil className="size-3.5" aria-hidden /> Edit
            </Button>
            <Button
                variant="outline"
                size="sm"
                disabled={row.status !== "PUBLISHED" || busy}
                title={
                    row.status !== "PUBLISHED"
                        ? "Chỉ câu PUBLISHED mới vào được trận"
                        : "Chọn một trận UPCOMING và mở composer với câu này"
                }
                onClick={() => setAdding(true)}
            >
                Thêm vào trận
            </Button>
            {TRANSITIONS[row.status].map((step) => {
                const blocked = step.adminOnly && !isAdmin
                return (
                    <Button
                        key={step.to}
                        variant={step.to === "ARCHIVED" ? "ghost" : "outline"}
                        size="sm"
                        disabled={blocked || busy}
                        title={blocked ? "Only an admin may publish" : `Move to ${STATUS_LABEL[step.to]}`}
                        onClick={() => onTransition(row, step.to)}
                    >
                        {step.label}
                    </Button>
                )
            })}
            {adding && <AddToMatchDialog rows={[row]} onClose={() => setAdding(false)} />}
        </div>
    )
}

function AddToMatchDialog({ rows, onClose }: { rows: BankQuestion[] | null; onClose: () => void }) {
    const tournaments = useTournaments({ limit: 50 })
    const [tournamentId, setTournamentId] = useState("")
    const [matchId, setMatchId] = useState("")
    const matches = useMatches(tournamentId)
    const upcoming = (matches.data?.items ?? []).filter((match) => match.status === "UPCOMING")
    const unbucketed = (rows ?? []).filter((row) => !bucketOf(row)).length

    if (!rows || rows.length === 0) return null

    const ready = Boolean(tournamentId && matchId && rows.some((row) => bucketOf(row)))
    const go = () => {
        if (!ready) return
        window.location.assign(
            `/tournaments/${tournamentId}/matches/${matchId}?add=${encodeURIComponent(
                rows.map((row) => row.id).join(",")
            )}`
        )
    }

    const description =
        rows.length === 1
            ? bucketOf(rows[0])
                ? `Câu nằm ở nhóm ${bucketOf(rows[0])} — chọn một trận UPCOMING để mở composer với câu đã sẵn sàng thêm.`
                : "Câu chưa gán nhóm — gán nhóm trước khi thêm vào trận."
            : `${rows.length} câu được chọn${
                  unbucketed > 0 ? ` — ${unbucketed} chưa gán nhóm sẽ bị bỏ qua` : ""
              }.`

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Thêm vào trận</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                        Giải đấu
                        <select
                            value={tournamentId}
                            onChange={(event) => {
                                setTournamentId(event.target.value)
                                setMatchId("")
                            }}
                            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                        >
                            <option value="">— chọn giải —</option>
                            {(tournaments.data?.items ?? []).map((tournament) => (
                                <option key={tournament.id} value={tournament.id}>
                                    {tournament.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                        Trận UPCOMING
                        <select
                            value={matchId}
                            onChange={(event) => setMatchId(event.target.value)}
                            disabled={!tournamentId || matches.isPending}
                            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                        >
                            <option value="">
                                {matches.isPending ? "Đang tải…" : "— chọn trận —"}
                            </option>
                            {upcoming.map((match) => (
                                <option key={match.id} value={match.id}>
                                    {match.label} · {match.stageId} · slot {match.slot ?? "—"}
                                </option>
                            ))}
                        </select>
                    </label>
                    {tournamentId && !matches.isPending && upcoming.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                            Giải này chưa có trận UPCOMING nào.
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Hủy</Button>
                    <Button onClick={go} disabled={!ready} title={ready ? undefined : "Chọn giải và trận"}>
                        Mở trận và thêm
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function PreviewText({
    row,
    className,
    onPreview,
}: {
    row: BankQuestion
    className?: string
    onPreview: (row: BankQuestion) => void
}) {
    return (
        <button
            type="button"
            onClick={() => onPreview(row)}
            title={`Preview: ${row.questionText}`}
            className={cn("block max-w-full truncate text-left hover:underline", className)}
        >
            {row.questionText}
        </button>
    )
}

function SelectBox({
    row,
    selected,
    onToggle,
}: {
    row: BankQuestion
    selected: Map<string, BankQuestion>
    onToggle: (row: BankQuestion) => void
}) {
    return (
        <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={() => onToggle(row)}
            aria-label={`Chọn: ${row.questionText}`}
            className="size-4 shrink-0 accent-primary"
        />
    )
}


function QuestionTable({
    rows,
    showKind,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
}: {
    rows: BankQuestion[]
    showKind: boolean
    selected: Map<string, BankQuestion>
    onToggleSelect: (row: BankQuestion) => void
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
}) {
    return (
        <div className="rounded-xl border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8">
                            <span className="sr-only">Chọn</span>
                        </TableHead>
                        <TableHead>Question</TableHead>
                        {showKind && <TableHead className="w-20">Kind</TableHead>}
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead className="w-28">Updated</TableHead>
                        <TableHead className="w-72 text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => {
                        const answer = answerSummary(row)
                        return (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <SelectBox
                                        row={row}
                                        selected={selected}
                                        onToggle={onToggleSelect}
                                    />
                                </TableCell>
                                <TableCell className="max-w-md">
                                    <span className="block truncate font-medium" title={row.questionText}>
                                        <PreviewText row={row} onPreview={onPreview} className="font-medium" />
                                    </span>
                                    {answer && (
                                        <span
                                            title={answer}
                                            className={cn(
                                                "block truncate text-xs",
                                                answer.includes("⚠") ? "text-destructive" : "text-muted-foreground"
                                            )}
                                        >
                                            {answer}
                                        </span>
                                    )}
                                    {flash?.id === row.id && (
                                        <span role="alert" className="block text-xs text-destructive">{flash.message}</span>
                                    )}
                                </TableCell>
                                {showKind && (
                                    <TableCell><Badge variant="outline">{typeOf(row)}</Badge></TableCell>
                                )}
                                <TableCell><StatusBadge status={row.status} /></TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {dateFormat.format(new Date(row.updatedAt))}
                                </TableCell>
                                <TableCell>
                                    <RowActions
                                        row={row}
                                        isAdmin={isAdmin}
                                        busy={busy}
                                        onEdit={onEdit}
                                        onTransition={onTransition}
                                    />
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    )
}


function McCard({
    row,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
}: {
    row: BankQuestion
    selected: Map<string, BankQuestion>
    onToggleSelect: (row: BankQuestion) => void
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
}) {
    const payload = row.payload as {
        options?: Array<{ id: string; text: string }>
        correctSet?: string[]
    }
    const options = payload.options ?? []
    const correct = new Set(payload.correctSet ?? [])
    const unanswerable = correct.size === 0

    return (
        <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                    <div className="pt-1">
                        <SelectBox row={row} selected={selected} onToggle={onToggleSelect} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <PreviewText row={row} onPreview={onPreview} className="text-sm font-semibold" />
                        {flash?.id === row.id && (
                            <span role="alert" className="block text-xs text-destructive">{flash.message}</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={row.status} />
                    <span className="text-xs text-muted-foreground">{dateFormat.format(new Date(row.updatedAt))}</span>
                </div>
            </div>

            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {options.map((option, index) => {
                    const isCorrect = correct.has(option.id)
                    return (
                        <li
                            key={option.id}
                            className={cn(
                                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                                isCorrect && "border-primary/40 bg-primary/5"
                            )}
                        >
                            <span className="shrink-0 font-semibold text-muted-foreground">
                                {String.fromCharCode(65 + index)}
                            </span>
                            <span className="truncate" title={option.text}>{option.text}</span>
                            {isCorrect && <span className="ml-auto shrink-0 text-xs font-medium text-primary">✓ correct</span>}
                        </li>
                    )
                })}
            </ul>

            {unanswerable && (
                <p className="mt-2 text-xs text-destructive">
                    ⚠ No correct option ticked — players cannot score this question.
                </p>
            )}

            <div className="mt-3 flex justify-end">
                <RowActions row={row} isAdmin={isAdmin} busy={busy} onEdit={onEdit} onTransition={onTransition} />
            </div>
        </div>
    )
}


function KeywordSetCard({
    row,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
    onAddHint,
}: {
    row: BankQuestion
    selected: Map<string, BankQuestion>
    onToggleSelect: (row: BankQuestion) => void
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
    onAddHint: (keywordId: string, openDialog?: boolean) => void
}) {
    const payload = row.payload as { code?: string }

    const hintParams = new URLSearchParams({ kind: "HINT", keywordId: row.id, limit: "100", offset: "0" })
    const hints = useQuery({
        queryKey: ["keyword-hints", row.id],
        queryFn: () => api<Paged>(`/portal/questions?${hintParams.toString()}`),
        staleTime: 15_000,
    })

    const hintRows = hints.data?.items ?? []
    const shown = hintRows.slice(0, HINT_MAX)
    const overLimit = hintRows.length > HINT_MAX
    const published = hintRows.filter((hint) => hint.status === "PUBLISHED").length

    return (
        <div className="overflow-hidden rounded-xl border bg-card">
            <div className="relative overflow-hidden px-5 py-6">
                <div className="relative grid gap-1.5">
                    <div className="w-fit">
                        <SelectBox row={row} selected={selected} onToggle={onToggleSelect} />
                    </div>
                    <button
                        type="button"
                        onClick={() => onPreview(row)}
                        title="Preview this question"
                        className="min-w-0 break-all text-left text-2xl font-bold hover:opacity-80 sm:text-3xl"
                    >
                        {payload.code || "(no keyword set)"}
                    </button>
                </div>

            </div>

            
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-5 py-3">
                <StatusBadge status={row.status} />
                <span className="text-sm text-muted-foreground">{dateFormat.format(new Date(row.updatedAt))}</span>
                <div className="ml-auto">
                    <RowActions row={row} isAdmin={isAdmin} busy={busy} onEdit={onEdit} onTransition={onTransition} />
                </div>
            </div>
            {flash?.id === row.id && (
                <span role="alert" className="block px-5 pt-2 text-xs text-destructive">{flash.message}</span>
            )}

            <div className="grid gap-3 p-5">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Hints</span>
                    <span className="text-sm font-semibold">
                        {published} <span className="font-normal text-muted-foreground">/ {HINT_MAX}</span>
                    </span>
                </div>


                {hints.isPending && (
                    <p className="text-sm text-muted-foreground">Loading hints…</p>
                )}
                {hints.isError && (
                    <p role="alert" className="text-sm text-destructive">{messageOf(hints.error)}</p>
                )}


                {shown.length > 0 && (
                    <ol className="grid gap-1.5">
                        {shown.map((hint, index) => {
                            const answer = answerSummary(hint)
                            return (
                                <li key={hint.id} className="rounded-lg border bg-background/60 px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                        <SelectBox row={hint} selected={selected} onToggle={onToggleSelect} />
                                        <span className="w-5 shrink-0 text-muted-foreground">{index + 1}.</span>
                                        <PreviewText row={hint} onPreview={onPreview} className="min-w-40 flex-1 truncate font-medium" />
                                        <StatusBadge status={hint.status} />
                                        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                                            {hint.timeLimit != null ? `${hint.timeLimit}s` : "no limit"}
                                        </span>
                                        <RowActions
                                            row={hint}
                                            isAdmin={isAdmin}
                                            busy={busy}
                                            onEdit={onEdit}
                                            onTransition={onTransition}
                                        />
                                    </div>
                                    {answer && (
                                        <span
                                            title={answer}
                                            className={cn(
                                                "mt-1 block truncate pl-7 text-xs",
                                                answer.includes("⚠") ? "text-destructive" : "text-muted-foreground"
                                            )}
                                        >
                                            {answer}
                                        </span>
                                    )}
                                    {flash?.id === hint.id && (
                                        <span role="alert" className="mt-0.5 block pl-7 text-xs text-destructive">
                                            {flash.message}
                                        </span>
                                    )}
                                </li>
                            )
                        })}
                    </ol>
                )}

                {overLimit && (
                    <p className="text-xs text-destructive">
                        ⚠ {hintRows.length} hints — the maximum is {HINT_MAX}; the {hintRows.length - HINT_MAX}{" "}
                        beyond it {hintRows.length - HINT_MAX === 1 ? "is" : "are"} not shown. Convert or archive the extras.
                    </p>
                )}


                <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={hints.isPending || hintRows.length >= HINT_MAX}
                        title={hintRows.length >= HINT_MAX ? `${HINT_MAX}/${HINT_MAX} hints used — convert or archive one first` : undefined}
                        onClick={() => onAddHint(row.id)}
                    >
                        <Lightbulb className="size-3.5" aria-hidden /> Add hint
                    </Button>
                </div>
            </div>
        </div>
    )
}


function bucketLabel(bucket: string | null): string | null {
    if (!bucket) return null
    for (const tabDef of TABS) {
        for (const group of tabDef.groups) {
            if (group.bucket === bucket) return `${tabDef.label} · ${group.label}`
        }
    }
    return bucket
}

function InspectorDrawer({ row, onClose }: { row: BankQuestion | null; onClose: () => void }) {
    const usage = useQuery({
        queryKey: ["question-usage", row?.id ?? "none"],
        queryFn: () =>
            api<{
                items: Array<{
                    id: string
                    tournamentId: string
                    label: string
                    stageId: string
                    status: string
                }>
            }>(`/portal/questions/${row?.id ?? ""}/usage`),
        enabled: row !== null,
        staleTime: 15_000,
    })

    if (!row) return null

    const payload = row.payload as {
        options?: Array<{ id: string; text: string }>
        correctSet?: string[]
        acceptedAnswers?: string[]
        code?: string
        normalize?: Partial<Normalize>
    }
    const correct = new Set(payload.correctSet ?? [])
    const items = usage.data?.items ?? []
    const bucket = bucketLabel(bucketOf(row))

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
            <aside
                role="dialog"
                aria-label={`Chi tiết: ${row.questionText}`}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l bg-card p-5 shadow-xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{typeOf(row)}</Badge>
                        <StatusBadge status={row.status} />
                        {bucket && <Badge variant="secondary">{bucket}</Badge>}
                    </div>
                    <Button variant="ghost" size="sm" aria-label="Đóng" onClick={onClose}>
                        <X className="size-4" />
                    </Button>
                </div>

                <h3 className="mt-3 text-base font-semibold">{row.questionText}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                    Cập nhật {dateFormat.format(new Date(row.updatedAt))}
                    {row.timeLimit != null ? ` · ${row.timeLimit}s` : " · không giới hạn thời gian"}
                </p>

                <div className="mt-4 grid gap-4 text-sm">
                    {payload.options && payload.options.length > 0 && (
                        <div className="grid gap-1.5">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Lựa chọn
                                {payload.acceptedAnswers
                                    ? " · mặt khán giả nhìn thấy"
                                    : ""}
                            </span>
                            <ul className="grid gap-1.5">
                                {payload.options.map((option, index) => (
                                    <li
                                        key={option.id}
                                        className={cn(
                                            "flex items-center gap-2 rounded-lg border px-3 py-1.5",
                                            correct.has(option.id) && "border-primary/40 bg-primary/5"
                                        )}
                                    >
                                        <span className="font-semibold text-muted-foreground">
                                            {String.fromCharCode(65 + index)}
                                        </span>
                                        <span className="min-w-0 truncate">{option.text}</span>
                                        {correct.has(option.id) && (
                                            <span className="ml-auto shrink-0 text-xs font-medium text-primary">
                                                ✓
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {payload.acceptedAnswers && payload.acceptedAnswers.length > 0 && (
                        <div className="grid gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Đáp án chấp nhận
                            </span>
                            <ul className="list-inside list-disc text-sm">
                                {payload.acceptedAnswers.map((answer) => (
                                    <li key={answer}>{answer}</li>
                                ))}
                            </ul>
                            <span className="text-xs text-muted-foreground">
                                {normSummary(payload.normalize)}
                            </span>
                        </div>
                    )}

                    {payload.code !== undefined && (
                        <div className="grid gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Keyword (bí mật)
                            </span>
                            <p className="rounded-lg border px-3 py-2">{payload.code}</p>
                            <span className="text-xs text-muted-foreground">
                                {normSummary(payload.normalize)}
                            </span>
                        </div>
                    )}

                    <div className="grid gap-1.5 border-t pt-3">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Đang dùng trong {usage.isPending ? "…" : `${items.length} trận`}
                        </span>
                        {usage.isError && (
                            <p className="text-xs text-destructive">{messageOf(usage.error)}</p>
                        )}
                        {!usage.isPending && !usage.isError && items.length === 0 && (
                            <p className="text-xs text-muted-foreground">Chưa vào trận nào.</p>
                        )}
                        <ul className="grid gap-1">
                            {items.map((match) => (
                                <li key={match.id}>
                                    <a
                                        className="text-sm underline-offset-2 hover:underline"
                                        href={`/tournaments/${match.tournamentId}/matches/${match.id}`}
                                    >
                                        {match.label}
                                    </a>
                                    <span className="text-xs text-muted-foreground">
                                        {" "}
                                        · {match.stageId} · {match.status}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {items.length >= 20 && (
                            <p className="text-xs text-muted-foreground">
                                Chỉ hiện 20 trận gần nhất.
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-auto pt-4">
                    <Button variant="outline" className="w-full" onClick={onClose}>
                        Đóng
                    </Button>
                </div>
            </aside>
        </>
    )
}


function ArchiveConfirmDialog({
    row,
    error,
    pending,
    onCancel,
    onConfirm,
}: {
    row: BankQuestion | null
    error: string | null
    pending: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    if (!row) return null
    return (
        <Dialog open onOpenChange={(next) => { if (!next) onCancel() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Archive this question?</DialogTitle>
                    <DialogDescription>
                        Archiving is permanent — this cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <p className="rounded-lg border px-3 py-2 text-sm text-foreground">
                        {row.questionText}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        An archived question is immutable: it can no longer be edited, restored, or published.
                        Matches assembled from it keep their frozen copy.
                    </p>
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
                    <Button onClick={onConfirm} disabled={pending}>
                        {pending ? "Archiving…" : "Archive"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const queryClient = useQueryClient()
    const [mode, setMode] = useState<"json" | "excel">("json")
    const [text, setText] = useState("")
    const [questions, setQuestions] = useState<unknown[] | null>(null)
    const [file, setFile] = useState<File | null>(null)
    const [mediaFiles, setMediaFiles] = useState<File[]>([])
    const [parseError, setParseError] = useState<string | null>(null)
    const [report, setReport] = useState<BatchReport | null>(null)
    const [excel, setExcel] = useState<ExcelReport | null>(null)
    const [validatedText, setValidatedText] = useState<string | null>(null)
    const [validatedFile, setValidatedFile] = useState<File | null>(null)
    const [validatedMedia, setValidatedMedia] = useState<File[] | null>(null)

    const parse = (): unknown[] | null => {
        setQuestions(null)
        setReport(null)
        setValidatedText(null)
        setParseError(null)

        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch {
            setParseError("That is not valid JSON.")
            return null
        }
        const envelope = parsed as { questions?: unknown }
        const rows = Array.isArray(parsed) ? parsed : Array.isArray(envelope?.questions) ? envelope.questions : null
        if (!rows) {
            setParseError('Paste a JSON array of questions (or an object with a "questions" array).')
            return null
        }
        if (rows.length === 0) {
            setParseError("The array is empty — nothing to import.")
            return null
        }
        if (rows.length > MAX_BATCH) {
            setParseError(`A batch may contain at most ${MAX_BATCH} questions.`)
            return null
        }
        setQuestions(rows)
        return rows
    }

    const validate = useMutation({
        mutationFn: (rows: unknown[]) =>
            api<BatchReport>("/portal/questions/batch", {
                method: "POST",
                body: JSON.stringify({ dryRun: true, questions: rows }),
            }),
        onSuccess: (result) => {
            setReport(result)
            setValidatedText(text)
        },
        onError: (cause) => setParseError(messageOf(cause)),
    })

    const runImport = useMutation({
        mutationFn: (rows: unknown[]) =>
            api<BatchReport>("/portal/questions/batch", {
                method: "POST",
                body: JSON.stringify({ dryRun: false, questions: rows }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            onClose()
        },
    })

    const postExcel = (dryRun: boolean, chosen: File) => {
        const form = new FormData()
        form.append("file", chosen, chosen.name)
        for (const media of mediaFiles) form.append("media", media, media.name)
        return api<ExcelReport>(`/portal/questions/import-excel?dryRun=${dryRun}`, {
            method: "POST",
            body: form,
        })
    }

    const validateExcel = useMutation({
        mutationFn: (chosen: File) => postExcel(true, chosen),
        onSuccess: (result, chosen) => {
            setExcel(result)
            setValidatedFile(chosen)
            setValidatedMedia(mediaFiles)
        },
        onError: (cause) => setParseError(messageOf(cause)),
    })

    const runExcelImport = useMutation({
        mutationFn: (chosen: File) => postExcel(false, chosen),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
            void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
            onClose()
        },
        onError: (cause) => setParseError(messageOf(cause)),
    })

    const onValidate = () => {
        if (mode === "excel") {
            if (file) validateExcel.mutate(file)
            return
        }
        const rows = parse()
        if (rows) validate.mutate(rows)
    }
    const onImport = () => {
        if (mode === "excel") {
            if (file && excel) runExcelImport.mutate(file)
            return
        }
        if (questions) runImport.mutate(questions)
    }

    const switchMode = (next: "json" | "excel") => {
        if (next === mode) return
        setMode(next)
        setText("")
        setQuestions(null)
        setFile(null)
        setMediaFiles([])
        setReport(null)
        setExcel(null)
        setValidatedText(null)
        setValidatedFile(null)
        setValidatedMedia(null)
        setParseError(null)
    }

    const currentReport = mode === "excel" ? excel : report
    const busy =
        validate.isPending ||
        runImport.isPending ||
        validateExcel.isPending ||
        runExcelImport.isPending
    const importError = mode === "excel" ? runExcelImport : runImport

    const changedSinceValidation = validatedText !== null && validatedText !== text
    const reason = (() => {
        if (parseError) return parseError
        if (mode === "excel") {
            if (!file) return "Choose an .xlsx file, then validate"
            if (!excel) return "Validate first (dry run)"
            if (validatedFile !== file) return "File changed since validation — validate again"
            if (validatedMedia !== mediaFiles) return "Media files changed since validation — validate again"
            return null
        }
        if (questions === null) return "Paste JSON, then validate"
        if (report === null) return "Validate first (dry run)"
        if (report.errors.length > 0) return `Fix ${report.errors.length} error(s) above`
        if (changedSinceValidation) return "Changed since validation — validate again"
        return null
    })()

    const willStage = mode === "excel" && currentReport !== null && currentReport.errors.length > 0

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose()
            }}
        >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Import questions</DialogTitle>
                    <DialogDescription>
                        {mode === "json"
                            ? `Paste a JSON batch (max ${MAX_BATCH}). Validate runs a dry run: the server checks every row — payload shape, duplicates — without writing anything.`
                            : "Upload the AOC workbook with the media its File column names (max 5 MB + 100 files). Validate runs a dry run: every row is checked — group IDs, payload shape, duplicates, missing media — without writing anything."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3">
                    <div className="flex w-fit gap-1 rounded-lg border p-1" role="group" aria-label="Import source">
                        <Button
                            size="sm"
                            variant={mode === "json" ? "secondary" : "ghost"}
                            onClick={() => switchMode("json")}
                        >
                            JSON
                        </Button>
                        <Button
                            size="sm"
                            variant={mode === "excel" ? "secondary" : "ghost"}
                            onClick={() => switchMode("excel")}
                        >
                            Excel (.xlsx)
                        </Button>
                    </div>

                    {mode === "json" ? (
                        <>
                            <label className="grid gap-1 text-sm" htmlFor="import-json">
                                Questions (JSON array, or {"{ \"questions\": [...] }"})
                            </label>
                            <textarea
                                id="import-json"
                                value={text}
                                onChange={(event) => {
                                    setText(event.target.value)
                                    setParseError(null)
                                }}
                                rows={10}
                                spellCheck={false}
                                placeholder={'[\n  { "kind": "TEXT", "questionText": "…", "payload": { "acceptedAnswers": ["…"], "normalize": { "caseSensitive": false, "trim": true, "stripAccents": true } } }\n]'}
                                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-xs"
                            />
                        </>
                    ) : (
                        <>
                            <label className="grid gap-1 text-sm" htmlFor="import-xlsx">
                                Workbook (.xlsx)
                            </label>
                            <input
                                id="import-xlsx"
                                type="file"
                                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                onChange={(event) => {
                                    setFile(event.target.files?.[0] ?? null)
                                    setExcel(null)
                                    setParseError(null)
                                }}
                                className="block w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-muted file:px-3 file:py-1 file:text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Template <span className="font-medium text-foreground">AOC_M00.xlsx</span> — sheets
                                KHOI_DONG · GIAI_MA · BUT_PHA · VE_DICH, columns ID · Câu hỏi · Đáp án · Giải thích ·
                                Ghi chú · File ảnh/video/audio. One accepted answer per line (Alt+Enter); GM_KEY
                                carries the keyword and GM_1…GM_8 its hints. Rows the template leaves empty are
                                skipped, never imported.
                            </p>

                            <label className="grid gap-1 text-sm" htmlFor="import-media">
                                Media files (optional)
                            </label>
                            <input
                                id="import-media"
                                type="file"
                                multiple
                                onChange={(event) => {
                                    setMediaFiles(Array.from(event.target.files ?? []))
                                    setExcel(null)
                                    setParseError(null)
                                }}
                                className="block w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-muted file:px-3 file:py-1 file:text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                The <span className="font-medium text-foreground">File ảnh/video/audio</span> column
                                names a file — bundle the ones you want stored and they upload with the import. A
                                cell naming a file you did NOT pick is reported as a warning: the row still
                                imports, without its media.
                            </p>
                            {mediaFiles.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {mediaFiles.length} file{mediaFiles.length === 1 ? "" : "s"} selected:{" "}
                                    {mediaFiles.slice(0, 6).map((media) => media.name).join(", ")}
                                    {mediaFiles.length > 6 ? ` … +${mediaFiles.length - 6} more` : ""}
                                </p>
                            )}
                        </>
                    )}

                    {currentReport && currentReport.errors.length === 0 && (
                        <p className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm">
                            ✓ {currentReport.total} question{currentReport.total === 1 ? "" : "s"} valid — ready to import.
                        </p>
                    )}

                    {currentReport && currentReport.errors.length > 0 && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                            <p className="text-sm font-medium text-destructive">
                                {currentReport.errors.length} of {currentReport.total} rows failed:
                            </p>
                            <ul className="mt-1 grid gap-1 text-xs text-destructive">
                                {currentReport.errors.map((failure) => (
                                    <li key={failure.index}>
                                        {excel
                                            ? `${excel.rows[failure.index]?.sheet ?? "?"} ${
                                                  excel.rows[failure.index]?.sourceId || `#${failure.index + 1}`
                                              }`
                                            : `Row ${failure.index + 1}`}
                                        : [{failure.code}] {failure.message}
                                        {failure.details.length > 0 ? ` — ${failure.details.join("; ")}` : ""}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {excel && excel.skipped > 0 && (
                        <p className="text-xs text-muted-foreground">
                            {excel.skipped} pre-seeded row{excel.skipped === 1 ? "" : "s"} left empty — skipped.
                        </p>
                    )}

                    {excel && excel.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                {excel.warnings.length} warning{excel.warnings.length === 1 ? "" : "s"} — these rows
                                still import:
                            </p>
                            
                            <ul className="mt-1 max-h-40 grid gap-1 overflow-y-auto text-xs text-amber-800 dark:text-amber-500">
                                {excel.warnings.map((warning) => (
                                    <li key={warning.index}>
                                        {excel.rows[warning.index]?.sourceId || `Row ${warning.index + 1}`}:{" "}
                                        {warning.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {excel && excel.rows.length > 0 && (
                        <div className="rounded-lg border">
                            <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                {excel.rows.length} row{excel.rows.length === 1 ? "" : "s"} →{" "}
                                {new Set(excel.rows.map((row) => row.bucket)).size} group(s)
                            </p>
                            <ul className="max-h-40 overflow-y-auto px-3 py-2 font-mono text-xs">
                                {excel.rows.map((row) => (
                                    <li key={row.index} className="flex gap-2">
                                        <span className="w-24 shrink-0 text-muted-foreground">{row.sheet}</span>
                                        <span className="w-24 shrink-0">{row.sourceId || `#${row.index + 1}`}</span>
                                        <span>{row.bucket}</span>
                                        <span className="ml-auto text-muted-foreground">{row.kind}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {importError.isError && (
                        <p role="alert" className="text-sm text-destructive">
                            {messageOf(importError.error)} — re-validate and try again.
                        </p>
                    )}
                </div>

                <DialogFooter className="items-center gap-2">
                    <span className="mr-auto text-xs text-muted-foreground">{reason}</span>
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={onValidate}
                        disabled={busy || (mode === "json" ? !text.trim() : !file)}
                    >
                        {validate.isPending || validateExcel.isPending ? "Validating…" : "Validate (dry run)"}
                    </Button>
                    <Button
                        onClick={onImport}
                        disabled={
                            reason !== null ||
                            currentReport === null ||
                            (mode === "json" && currentReport.errors.length > 0) ||
                            busy
                        }
                        title={reason ?? undefined}
                    >
                        {runImport.isPending || runExcelImport.isPending
                            ? "Importing…"
                            : willStage
                              ? "Import & review"
                              : "Import"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


function QuestionDialog({
    row,
    presetKeywordId,
    bucket,
    open,
    onClose,
}: {
    row: BankQuestion | null
    presetKeywordId?: string
    bucket?: string
    open: boolean
    onClose: () => void
}) {
    const queryClient = useQueryClient()
    const [error, setError] = useState<string | null>(null)

    const save = useMutation({
        mutationFn: (input: AuthorSave) => {
            const kind: Kind =
                input.type === "KEYWORD"
                    ? "KEYWORD"
                    : input.type === "CHOICE"
                      ? "CHOICE"
                      : input.keywordId
                        ? "HINT"
                        : "TEXT"
            const body: Record<string, unknown> = {
                questionText: input.questionText,
                payload: input.payload,
                tags: input.tags,
            }
            if (input.timeLimit != null) body.timeLimit = input.timeLimit
            if (input.keywordId) body.keywordId = input.keywordId
            if (row) {
                if (kind !== row.kind) body.kind = kind
                body.keywordId = input.keywordId 
                body.timeLimit = input.timeLimit 
                return api(`/portal/questions/${row.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(body),
                })
            }
            body.kind = kind
            return api("/portal/questions", { method: "POST", body: JSON.stringify(body) })
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-list"] })
            onClose()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    return (
        <QuestionAuthorDialog
            open={open}
            row={row}
            bucket={bucket}
            presetKeywordId={presetKeywordId}
            busy={save.isPending}
            saveError={error}
            onCancel={onClose}
            onSave={(input) => save.mutate(input)}
        />
    )
}


function GroupSection({
    group,
    rows,
    count,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
    onAdd,
    onAddHint,
}: {
    group: GroupDef
    rows: BankQuestion[]
    count?: number
    selected: Map<string, BankQuestion>
    onToggleSelect: (row: BankQuestion) => void
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
    onAdd: (bucket: string) => void
    onAddHint: (keywordId: string, openDialog?: boolean) => void
}) {
    const keywords = rows.filter((row) => row.kind === "KEYWORD")
    const choices = rows.filter((row) => row.kind === "CHOICE")
    const plain = rows.filter((row) => row.kind !== "KEYWORD" && row.kind !== "CHOICE")

    return (
        <section className="grid gap-3" aria-label={`Nhóm ${group.label}`}>
            <header className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2.5">
                <span className="text-sm font-semibold">{group.label}</span>
                {group.typeLabel && <Badge variant="secondary">{group.typeLabel}</Badge>}
                <span className="text-xs text-muted-foreground">{count ?? rows.length} câu</span>
                {group.bucket && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => onAdd(group.bucket as string)}
                    >
                        <Plus className="size-4" aria-hidden /> Thêm
                    </Button>
                )}
            </header>

            {rows.length === 0 && (
                <p className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
                    Chưa có câu hỏi trong nhóm này.
                </p>
            )}

            {plain.length > 0 && (
                <QuestionTable
                    rows={plain}
                    showKind
                    selected={selected}
                    onToggleSelect={onToggleSelect}
                    isAdmin={isAdmin}
                    busy={busy}
                    flash={flash}
                    onEdit={onEdit}
                    onPreview={onPreview}
                    onTransition={onTransition}
                />
            )}

            {choices.length > 0 && (
                <div className="grid gap-3">
                    {choices.map((row) => (
                        <McCard
                            key={row.id}
                            row={row}
                            selected={selected}
                            onToggleSelect={onToggleSelect}
                            isAdmin={isAdmin}
                            busy={busy}
                            flash={flash}
                            onEdit={onEdit}
                            onPreview={onPreview}
                            onTransition={onTransition}
                        />
                    ))}
                </div>
            )}

            {keywords.length > 0 && (
                <div className="grid gap-4">
                    {keywords.map((row) => (
                        <KeywordSetCard
                            key={row.id}
                            row={row}
                            selected={selected}
                            onToggleSelect={onToggleSelect}
                            isAdmin={isAdmin}
                            busy={busy}
                            flash={flash}
                            onEdit={onEdit}
                            onPreview={onPreview}
                            onTransition={onTransition}
                            onAddHint={onAddHint}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}

function GroupList({
    tab,
    rows,
    counts,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
    onAdd,
    onAddHint,
}: {
    tab: TabDef
    rows: BankQuestion[]
    counts?: Record<string, number>
    selected: Map<string, BankQuestion>
    onToggleSelect: (row: BankQuestion) => void
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
    onAdd: (bucket: string) => void
    onAddHint: (keywordId: string, openDialog?: boolean) => void
}) {
    const assigned = rows.filter((row) => belongsToTab(bucketOf(row), tab.id))
    const unassigned = rows.filter((row) => bucketOf(row) === null)
    const shared = {
        rows,
        selected,
        onToggleSelect,
        isAdmin,
        busy,
        flash,
        onEdit,
        onPreview,
        onTransition,
        onAdd,
        onAddHint,
    }

    return (
        <div className="grid gap-6">
            {tab.groups.map((group) => (
                <GroupSection
                    key={group.bucket}
                    group={group}
                    count={group.bucket ? counts?.[group.bucket] : undefined}
                    {...shared}
                    rows={assigned.filter((row) => bucketOf(row) === group.bucket)}
                />
            ))}
            {unassigned.length > 0 && (
                <GroupSection group={UNASSIGNED} {...shared} rows={unassigned} />
            )}
        </div>
    )
}


export function QuestionsPage() {
    const queryClient = useQueryClient()
    const { data: me } = useMe()

    const [state, setState] = useState<UrlState>(() => readUrlState())
    const [searchInput, setSearchInput] = useState(() => state.search)

    const update = (patch: Partial<UrlState>) =>
        setState((current) => ({ ...current, ...patch }))

    useEffect(() => {
        if (searchInput.trim() === state.search) return
        const timer = setTimeout(() => update({ search: searchInput.trim() }), 350)
        return () => clearTimeout(timer)
    }, [searchInput, state.search])

    useEffect(() => {
        const params = new URLSearchParams()
        params.set("tab", state.tab)
        if (state.status !== "ALL") params.set("status", state.status)
        if (state.search) params.set("search", state.search)
        const query = params.toString()
        window.history.replaceState(
            null,
            "",
            window.location.pathname + (query ? `?${query}` : "") + window.location.hash
        )
    }, [state])

    const list = useQuery({
        queryKey: ["questions", listParams(state).toString()],
        queryFn: () => api<Paged>(`/portal/questions?${listParams(state).toString()}`),
    })

    const countFilters = JSON.stringify({ status: state.status, search: state.search })
    const counts = useQuery({
        queryKey: ["bucket-counts", countFilters],
        queryFn: () => {
            const params = new URLSearchParams()
            if (state.status !== "ALL") params.set("status", state.status)
            if (state.search) params.set("search", state.search)
            const qs = params.toString()
            return api<Record<string, number>>(`/portal/questions/bucket-counts${qs ? `?${qs}` : ""}`)
        },
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    })

    const [flash, setFlash] = useState<{ id: string; message: string } | null>(null)
    const [confirming, setConfirming] = useState<BankQuestion | null>(null)
    const [selected, setSelected] = useState<Map<string, BankQuestion>>(new Map())
    const [bulkBusy, setBulkBusy] = useState(false)
    const [bulkFlash, setBulkFlash] = useState<string | null>(null)
    const [addRows, setAddRows] = useState<BankQuestion[] | null>(null)

    const transition = useMutation({
        mutationFn: (input: { id: string; to: Status }) =>
            api(`/portal/questions/${input.id}/status`, { method: "PATCH", body: JSON.stringify({ status: input.to }) }),
        onSuccess: () => {
            setFlash(null)
            setConfirming(null)
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
        },
        onError: (cause, input) => setFlash({ id: input.id, message: messageOf(cause) }),
    })

    const [editing, setEditing] = useState<{
        open: boolean
        row: BankQuestion | null
        presetKeywordId?: string
        bucket?: string
    }>({
        open: false,
        row: null,
    })
    const [previewing, setPreviewing] = useState<BankQuestion | null>(null)
    const [importOpen, setImportOpen] = useState(false)

    const requestTransition = (row: BankQuestion, to: Status) => {
        if (to === "ARCHIVED") {
            setConfirming(row)
            return
        }
        transition.mutate({ id: row.id, to })
    }

    const addHint = (keywordId: string, openDialog = true) => {
        update({ tab: "giai-ma" })
        if (openDialog) setEditing({ open: true, row: null, presetKeywordId: keywordId, bucket: "giai-ma" })
    }

    const isAdmin = me?.role === "ADMIN"
    const rows = list.data?.items ?? []

    const toggleSelect = (row: BankQuestion) =>
        setSelected((current) => {
            const next = new Map(current)
            if (next.has(row.id)) next.delete(row.id)
            else next.set(row.id, row)
            return next
        })

    const clearSelection = () => setSelected(new Map())

    const runBulk = async (
        what: string,
        jobs: Array<() => Promise<unknown>>,
        skipped: number
    ) => {
        if (jobs.length === 0) {
            setBulkFlash(
                skipped > 0
                    ? `Không có câu nào đủ điều kiện (${skipped} bị bỏ qua).`
                    : "Không có gì để làm."
            )
            return
        }
        setBulkBusy(true)
        setBulkFlash(null)
        try {
            const results = await Promise.allSettled(jobs.map((job) => job()))
            const done = results.filter((result) => result.status === "fulfilled").length
            const firstError = results.find(
                (result): result is PromiseRejectedResult => result.status === "rejected"
            )
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
            clearSelection()
            setBulkFlash(
                firstError
                    ? `${what}: ${done}/${results.length} thành công — lỗi đầu: ${messageOf(firstError.reason)}`
                    : `${what}: ${done} câu đã xử lý.`
            )
        } finally {
            setBulkBusy(false)
        }
    }

    const bulkStatus = (to: Status) => {
        const eligible = [...selected.values()].filter((row) =>
            TRANSITIONS[row.status].some(
                (step) => step.to === to && !(step.adminOnly && !isAdmin)
            )
        )
        runBulk(
            `Chuyển ${STATUS_LABEL[to]}`,
            eligible.map((row) => () =>
                api(`/portal/questions/${row.id}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: to }),
                })
            ),
            selected.size - eligible.length
        )
    }

    const bulkDuplicate = () =>
        runBulk(
            "Nhân bản",
            [...selected.values()].map((row) => () =>
                api(`/portal/questions/${row.id}/duplicate`, { method: "POST" })
            ),
            0
        )

    const bulkBucket = (bucket: string) => {
        const eligible = [...selected.values()].filter((row) => row.status !== "ARCHIVED")
        runBulk(
            `Gắn nhóm ${bucket}`,
            eligible.map((row) => () =>
                api(`/portal/questions/${row.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        tags: [
                            ...(row.tags ?? []).filter((tag) => !BUCKET_TAGS.has(tag)),
                            bucket,
                        ],
                    }),
                })
            ),
            selected.size - eligible.length
        )
    }


    const emptyDescription = () => {
        if (searchInput.trim() || state.status !== "ALL") {
            return "Loosen the filters, or author the first one."
        }
        return `Chưa có câu nào ở tab ${activeTab(state.tab).label} — thêm câu đầu tiên.`
    }

    return (
        <Page>
            <PageHeader
                title="Questions"
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setImportOpen(true)}>
                            <Download className="size-4" aria-hidden /> Import
                        </Button>
                        <Button onClick={() => setEditing({ open: true, row: null })}>
                            <Plus className="size-4" aria-hidden /> New question
                        </Button>
                    </div>
                }
            />

            
            <StagedImportBanner />

            
            <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-sm">
                    Status
                    <select
                        value={state.status}
                        onChange={(event) => update({ status: event.target.value as Status | "ALL" })}
                        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    >
                        <option value="ALL">All</option>
                        <option value="DRAFT">Draft</option>
                        <option value="PENDING">In review</option>
                        <option value="PUBLISHED">Published</option>
                        <option value="ARCHIVED">Archived</option>
                    </select>
                </label>


                <form
                    className="flex items-end gap-2"
                    onSubmit={(event) => {
                        event.preventDefault()
                        update({ search: searchInput.trim() })
                    }}
                >
                    <label className="grid gap-1 text-sm">
                        Search
                        <Input
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            placeholder="question text…"
                            className="h-8 w-56"
                        />
                    </label>
                    <Button type="submit" variant="outline" size="sm" className="h-8">Search</Button>
                </form>

                {TABS.map((tab) => {
                    const active = state.tab === tab.id
                    const count = tab.groups.reduce(
                        (sum, group) => sum + (counts.data?.[group.bucket ?? ""] ?? 0),
                        0
                    )
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => update({ tab: tab.id })}
                            className={cn(
                                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                                active
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "bg-background hover:bg-muted"
                            )}
                        >
                            {tab.label}
                            <span className="ml-1.5 text-xs font-normal opacity-70">{count}</span>
                        </button>
                    )
                })}
            </div>

            {list.isPending && <ListSkeleton />}
            {list.isError && <ErrorPanel message={messageOf(list.error)} />}

            {list.data && rows.length === 0 && (
                <EmptyState
                    icon={FileText}
                    title="No questions match"
                    description={emptyDescription()}
                />
            )}

            {list.data && rows.length > 0 && (
                <GroupList
                    tab={activeTab(state.tab)}
                    rows={rows}
                    counts={counts.data}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    isAdmin={isAdmin}
                    busy={transition.isPending}
                    flash={flash}
                    onEdit={(row) => setEditing({ open: true, row })}
                    onPreview={setPreviewing}
                    onTransition={requestTransition}
                    onAdd={(bucket) => setEditing({ open: true, row: null, bucket })}
                    onAddHint={addHint}
                />
            )}

            {list.data && list.data.total > rows.length && (
                <p className="text-xs text-muted-foreground">
                    Đang hiển thị {rows.length} của {list.data.total} câu khớp bộ lọc — thu hẹp
                    tìm kiếm để xem thêm.
                </p>
            )}

            {editing.open && (
                <QuestionDialog
                    key={editing.row?.id ?? "new"}
                    row={editing.row}
                    presetKeywordId={editing.presetKeywordId}
                    bucket={editing.bucket}
                    open={editing.open}
                    onClose={() => setEditing({ open: false, row: null })}
                />
            )}

            {previewing && <InspectorDrawer row={previewing} onClose={() => setPreviewing(null)} />}

            <ArchiveConfirmDialog
                row={confirming}
                error={confirming && transition.isError ? messageOf(transition.error) : null}
                pending={transition.isPending}
                onCancel={() => setConfirming(null)}
                onConfirm={() => {
                    if (confirming) transition.mutate({ id: confirming.id, to: "ARCHIVED" })
                }}
            />

            {importOpen && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />}

            
            {selected.size > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">{selected.size} đã chọn</span>
                        <span className="text-xs text-muted-foreground">
                            ở{" "}
                            {[...new Set([...selected.values()].map((row) => bucketOf(row) ?? "chưa gán"))].join(
                                ", "
                            )}
                        </span>
                        <Button
                            className="ml-auto"
                            size="sm"
                            variant="outline"
                            disabled={bulkBusy}
                            onClick={() => bulkStatus("PENDING")}
                        >
                            Nộp duyệt
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={bulkBusy || !isAdmin}
                            title={isAdmin ? undefined : "Chỉ admin mới được đăng"}
                            onClick={() => bulkStatus("PUBLISHED")}
                        >
                            Đăng
                        </Button>
                        <Button size="sm" variant="outline" disabled={bulkBusy} onClick={bulkDuplicate}>
                            Nhân bản
                        </Button>
                        <select
                            value=""
                            disabled={bulkBusy}
                            aria-label="Gắn nhóm cho các câu đã chọn"
                            onChange={(event) => {
                                if (event.target.value) bulkBucket(event.target.value)
                            }}
                            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                        >
                            <option value="">Gắn nhóm…</option>
                            {TABS.flatMap((tabDef) =>
                                tabDef.groups.map((group) => (
                                    <option
                                        key={group.bucket ?? group.label}
                                        value={group.bucket ?? ""}
                                    >
                                        {tabDef.label} · {group.label}
                                    </option>
                                ))
                            )}
                        </select>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={bulkBusy}
                            onClick={() => setAddRows([...selected.values()])}
                        >
                            Thêm vào trận
                        </Button>
                        <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={clearSelection}>
                            Bỏ chọn
                        </Button>
                        {bulkBusy && (
                            <span className="text-xs text-muted-foreground">Đang xử lý…</span>
                        )}
                    </div>
                    {bulkFlash && (
                        <p className="mx-auto max-w-6xl pt-1 text-xs text-muted-foreground" role="status">
                            {bulkFlash}
                        </p>
                    )}
                </div>
            )}
            {addRows !== null && (
                <AddToMatchDialog rows={addRows} onClose={() => setAddRows(null)} />
            )}
        </Page>
    )
}
