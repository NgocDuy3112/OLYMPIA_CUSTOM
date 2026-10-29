import { useEffect, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, FileText, Lightbulb, Pencil, Plus } from "lucide-react"
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
import { useMe } from "@/lib/session"

// ui-patterns.md rule): browse/filter here, author/edit only inside the dialog,
// status moves are explicit row actions (operations, not forms). One Save per
// dialog; the draft is derived from the server row when the dialog opens and
// Cancel discards it.
//
// The surface is split BY KIND (tabs): TEXT renders as plain rows, MC as
// card-rows where the options are visible at a glance, KEYWORD as one big
// set-card per keyword — the keyword as the title, the hints as sub rows, and
// no prose beyond that.
//
// A hint is a KIND of its own (HINT): a typed answer that belongs to a keyword
// set — same payload shape as TEXT, never listed as a TEXT question. A hint has
// NO tab and no list of its own: it lives only as a sub-row of its keyword's
// card (kind=HINT, grouped by the keyword's tag, D1), born from the card's
// "Add hint" or from a TEXT ↔ HINT conversion — the one kind conversion the
// dialog and the service allow. A set holds at most HINT_MAX (8).
//
// Status workflow (backend `transitions.ts`):
//   DRAFT → PENDING | ARCHIVED · PENDING → DRAFT | PUBLISHED | ARCHIVED
//   PUBLISHED → PENDING | ARCHIVED · ARCHIVED → (terminal, immutable)
// Publishing is admin-only — the button says why when it is disabled.
// ARCHIVED is terminal, so it asks for a confirmation that states the invariant.
//
// Filters (status/tag/search/kind/offset) live in the URL via replaceState —
// this page renders without a Router in the test harness, and refresh/share
// must keep the view. Search and tag apply debounced.

type Kind = "MC" | "TEXT" | "KEYWORD" | "HINT"
type Status = "DRAFT" | "PENDING" | "PUBLISHED" | "ARCHIVED"

interface BankQuestion {
    id: string
    kind: Kind
    questionText: string
    // The ve-dich board's category label — presentation only.
    domain?: string | null
    // A hint's set: the keyword it lives under.
    keywordId?: string | null
    status: Status
    timeLimit: number | null
    payload: Record<string, unknown>
    updatedAt: string
}

interface Paged {
    items: BankQuestion[]
    total: number
}

// The batch import report (backend service.ts → BatchReport).
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

const LIMIT = 20
const MAX_BATCH = 500
// docs/game-rules.md §giai-ma: at most 8 hints per set.
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


type TabKind = Kind

interface UrlState {
    kind: TabKind
    status: Status | "ALL"
    search: string
    offset: number
}

const TAB_KINDS: TabKind[] = ["TEXT", "MC", "KEYWORD"]
const STATUSES: Status[] = ["DRAFT", "PENDING", "PUBLISHED", "ARCHIVED"]

function readUrlState(): UrlState {
    const fallback: UrlState = { kind: "TEXT", status: "ALL", search: "", offset: 0 }
    if (typeof window === "undefined") return fallback
    const params = new URLSearchParams(window.location.search)
    const kind = params.get("kind") ?? "TEXT"
    const status = params.get("status") ?? "ALL"
    const offset = Number(params.get("offset") ?? "0")
    return {
        kind: (TAB_KINDS as string[]).includes(kind) ? (kind as TabKind) : "TEXT",
        status: (STATUSES as string[]).includes(status) ? (status as Status) : "ALL",
        search: params.get("search") ?? "",
        offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
    }
}

function listParams(state: UrlState, limit = LIMIT): URLSearchParams {
    const params = new URLSearchParams({ limit: String(limit), offset: String(state.offset) })
    params.set("kind", state.kind)
    if (state.status !== "ALL") params.set("status", state.status)
    if (state.search) params.set("search", state.search)
    return params
}

// ── the edit draft ────────────────────────────────────────────────────────────

interface Normalize {
    caseSensitive: boolean
    trim: boolean
    stripAccents: boolean
}

interface Draft {
    kind: Kind
    questionText: string
    domain: string // ve-dich board category; "" = none
    keywordId: string // HINT only: the set this hint joins; "" = none yet
    timeLimit: string // "" = none
    options: Array<{ id: string; text: string }>
    correct: string[]
    accepted: string // one answer per line
    code: string
    norm: Normalize
}

const DEFAULT_NORM: Normalize = { caseSensitive: false, trim: true, stripAccents: true }

function nextOptionId(existing: string[]): string {
    for (let i = 0; i < 26; i += 1) {
        const id = String.fromCharCode(97 + i)
        if (!existing.includes(id)) return id
    }
    return `o${existing.length}`
}

function draftFrom(row: BankQuestion | null, presetKeywordId?: string, presetKind?: Kind): Draft {
    const base: Draft = {
        kind: row?.kind ?? presetKind ?? "TEXT",
        questionText: row?.questionText ?? "",
        domain: row?.domain ?? "",
        keywordId: row?.keywordId ?? presetKeywordId ?? "",
        timeLimit: row?.timeLimit != null ? String(row.timeLimit) : "",
        options: [
            { id: "a", text: "" },
            { id: "b", text: "" },
        ],
        correct: [],
        accepted: "",
        code: "",
        norm: { ...DEFAULT_NORM },
    }
    if (!row) return base

    const payload = row.payload as {
        options?: Array<{ id: string; text: string }>
        correctSet?: string[]
        acceptedAnswers?: string[]
        code?: string
        normalize?: Partial<Normalize>
    }
    if (Array.isArray(payload.options)) {
        base.options = payload.options.map((o) => ({ id: o.id, text: o.text }))
        base.correct = payload.correctSet ?? []
    }
    if (Array.isArray(payload.acceptedAnswers)) {
        base.accepted = payload.acceptedAnswers.join("\n")
    }
    if (typeof payload.code === "string") {
        base.code = payload.code
    }
    if (payload.normalize) {
        base.norm = { ...DEFAULT_NORM, ...payload.normalize }
    }
    return base
}

// null = the draft cannot be a valid payload yet (the dialog shows why).
function buildPayload(draft: Draft): Record<string, unknown> | null {
    if (draft.kind === "MC") {
        const options = draft.options
            .filter((o) => o.text.trim())
            .map((o) => ({ id: o.id, text: o.text.trim() }))
        if (options.length === 0) return null
        const ids = new Set(options.map((o) => o.id))
        return { options, correctSet: draft.correct.filter((id) => ids.has(id)) }
    }
    // HINT shares TEXT's payload on purpose — see assertPayloadForKind.
    if (draft.kind === "TEXT" || draft.kind === "HINT") {
        const acceptedAnswers = draft.accepted.split("\n").map((line) => line.trim()).filter(Boolean)
        if (acceptedAnswers.length === 0) return null
        return { acceptedAnswers, normalize: draft.norm }
    }
    if (!draft.code.trim()) return null
    return { code: draft.code.trim(), normalize: draft.norm }
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

// The answer, in plain sight — the bank is a staff-only surface.
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
    if (row.kind === "MC") {
        const text = new Map((payload.options ?? []).map((option) => [option.id, option.text]))
        const correct = (payload.correctSet ?? [])
            .map((id) => text.get(id))
            .filter((value): value is string => Boolean(value))
        return correct.length > 0 ? `→ ${correct.join(" · ")}` : "→ ⚠ no correct option ticked"
    }
    return payload.code ? `→ ${payload.code}` : null
}

// ── the row actions (shared by the table, the MC cards, the hint rows) ────────

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
        </div>
    )
}

// A question's text opens the read-only preview — a button, so it stays
// keyboard reachable (and the table cell keeps its title attribute).
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

// ── the question table (ALL and TEXT tabs) ────────────────────────────────────

function QuestionTable({
    rows,
    showKind,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
}: {
    rows: BankQuestion[]
    showKind: boolean
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
                                    <TableCell><Badge variant="outline">{row.kind}</Badge></TableCell>
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

// ── the MC cards ──────────────────────────────────────────────────────────────

function McCard({
    row,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
}: {
    row: BankQuestion
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
                <div className="min-w-0 flex-1">
                    <PreviewText row={row} onPreview={onPreview} className="text-sm font-semibold" />
                    {flash?.id === row.id && (
                        <span role="alert" className="block text-xs text-destructive">{flash.message}</span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {row.domain && <Badge variant="outline">{row.domain}</Badge>}
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

// ── the KEYWORD set-card ──────────────────────────────────────────────────────

function KeywordSetCard({
    row,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
    onAddHint,
}: {
    row: BankQuestion
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
    onAddHint: (keywordId: string, openDialog?: boolean) => void
}) {
    const payload = row.payload as { code?: string }

    // The set: this keyword's own hints — filtered server-side by the link.
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

            {/* operations */}
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

// ── the read-only preview ─────────────────────────────────────────────────────

function PreviewDialog({ row, onClose }: { row: BankQuestion | null; onClose: () => void }) {
    if (!row) return null

    const payload = row.payload as {
        options?: Array<{ id: string; text: string }>
        correctSet?: string[]
        acceptedAnswers?: string[]
        code?: string
        normalize?: Partial<Normalize>
    }
    const correct = new Set(payload.correctSet ?? [])

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Preview question</DialogTitle>
                    <DialogDescription>Read-only — edit it from the row action.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{row.kind}</Badge>
                        <StatusBadge status={row.status} />
                        <span className="text-sm text-muted-foreground">
                            Updated {dateFormat.format(new Date(row.updatedAt))}
                            {row.timeLimit != null ? ` · ${row.timeLimit}s limit` : " · no time limit"}
                            {row.domain ? ` · ${row.domain}` : ""}
                        </span>
                    </div>

                    <div className="grid gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Question
                        </span>
                        <p className="text-sm font-medium">{row.questionText}</p>
                    </div>

                    {row.kind === "MC" && (
                        <div className="grid gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Options · correct ticked
                            </span>
                            <ul className="grid gap-1.5">
                                {(payload.options ?? []).map((option, index) => (
                                    <li
                                        key={option.id}
                                        className={cn(
                                            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                                            correct.has(option.id) && "border-primary/40 bg-primary/5"
                                        )}
                                    >
                                        <span className="font-semibold text-muted-foreground">
                                            {String.fromCharCode(65 + index)}
                                        </span>
                                        <span>{option.text}</span>
                                        {correct.has(option.id) && <span className="ml-auto text-xs text-primary">✓</span>}
                                    </li>
                                ))}
                            </ul>
                            {correct.size === 0 && (
                                <p className="text-xs text-destructive">⚠ No correct option ticked.</p>
                            )}
                        </div>
                    )}

                    {(row.kind === "TEXT" || row.kind === "HINT") && (
                        <div className="grid gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Accepted answers
                            </span>
                            <ul className="list-inside list-disc text-sm">
                                {(payload.acceptedAnswers ?? []).map((answer) => (
                                    <li key={answer}>{answer}</li>
                                ))}
                            </ul>
                            <span className="text-xs text-muted-foreground">{normSummary(payload.normalize)}</span>
                        </div>
                    )}

                    {row.kind === "KEYWORD" && (
                        <div className="grid gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Keyword (secret)
                            </span>
                            <p className="rounded-lg border px-3 py-2 text-sm">{payload.code}</p>
                            <span className="text-xs text-muted-foreground">{normSummary(payload.normalize)}</span>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── the archive confirmation ──────────────────────────────────────────────────

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

// ── the batch import ──────────────────────────────────────────────────────────

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const queryClient = useQueryClient()
    const [text, setText] = useState("")
    const [questions, setQuestions] = useState<unknown[] | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [report, setReport] = useState<BatchReport | null>(null)
    const [validatedText, setValidatedText] = useState<string | null>(null)

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
            void queryClient.invalidateQueries({ queryKey: ["question-counts"] })
            onClose()
        },
    })

    const onValidate = () => {
        const rows = parse()
        if (rows) validate.mutate(rows)
    }
    const onImport = () => {
        if (questions) runImport.mutate(questions)
    }

    const changedSinceValidation = validatedText !== null && validatedText !== text
    const reason =
        parseError ??
        (questions === null
            ? "Paste JSON, then validate"
            : report === null
                ? "Validate first (dry run)"
                : report.errors.length > 0
                    ? `Fix ${report.errors.length} error(s) above`
                    : changedSinceValidation
                        ? "Changed since validation — validate again"
                        : null)

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
                        Paste a JSON batch (max {MAX_BATCH}). Validate runs a dry run: the server checks every
                        row — payload shape, duplicates — without writing anything.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3">
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

                    {report && report.errors.length === 0 && (
                        <p className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm">
                            ✓ {report.total} question{report.total === 1 ? "" : "s"} valid — ready to import.
                        </p>
                    )}

                    {report && report.errors.length > 0 && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                            <p className="text-sm font-medium text-destructive">
                                {report.errors.length} of {report.total} rows failed:
                            </p>
                            <ul className="mt-1 grid gap-1 text-xs text-destructive">
                                {report.errors.map((failure) => (
                                    <li key={failure.index}>
                                        Row {failure.index + 1}: [{failure.code}] {failure.message}
                                        {failure.details.length > 0 ? ` — ${failure.details.join("; ")}` : ""}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {runImport.isError && (
                        <p role="alert" className="text-sm text-destructive">
                            {messageOf(runImport.error)} — re-validate and try again.
                        </p>
                    )}
                </div>

                <DialogFooter className="items-center gap-2">
                    <span className="mr-auto text-xs text-muted-foreground">{reason}</span>
                    <Button variant="outline" onClick={onClose} disabled={validate.isPending || runImport.isPending}>
                        Cancel
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={onValidate}
                        disabled={!text.trim() || validate.isPending || runImport.isPending}
                    >
                        {validate.isPending ? "Validating…" : "Validate (dry run)"}
                    </Button>
                    <Button
                        onClick={onImport}
                        disabled={
                            reason !== null ||
                            report === null ||
                            report.errors.length > 0 ||
                            runImport.isPending
                        }
                        title={reason ?? undefined}
                    >
                        {runImport.isPending ? "Importing…" : "Import"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── the dialog ────────────────────────────────────────────────────────────────

function QuestionDialog({
    row,
    presetKeywordId,
    presetKind,
    open,
    onClose,
}: {
    row: BankQuestion | null
    presetKeywordId?: string
    presetKind?: Kind
    open: boolean
    onClose: () => void
}) {
    const queryClient = useQueryClient()
    const [draft, setDraft] = useState<Draft>(() => draftFrom(row, presetKeywordId, presetKind))
    const [error, setError] = useState<string | null>(null)

    const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))

    // The 8-hint cap, checked against the set of the tag being edited (the same
    // cache entry the keyword card reads). The row itself stops counting when it
    // stops being a HINT, so a conversion back is never blocked by the cap.
    const hintParams = new URLSearchParams({
        kind: "HINT",
        keywordId: draft.keywordId,
        limit: "100",
        offset: "0",
    })
    const hintPool = useQuery({
        queryKey: ["keyword-hints", draft.keywordId],
        queryFn: () => api<Paged>(`/portal/questions?${hintParams.toString()}`),
        enabled: draft.kind === "HINT" && draft.keywordId.length > 0,
        staleTime: 15_000,
    })
    const selfIsHint = row !== null && row.kind === "HINT" && row.keywordId === draft.keywordId
    const otherHints = Math.max(0, (hintPool.data?.items ?? []).length - (selfIsHint ? 1 : 0))
    const hintCapFull = draft.kind === "HINT" && draft.keywordId.length > 0 && otherHints >= HINT_MAX

    // The set picker: every (non-archived) keyword can parent a hint.
    const keywordList = useQuery({
        queryKey: ["keyword-list"],
        queryFn: () =>
            api<Paged>(
                `/portal/questions?${new URLSearchParams({ kind: "KEYWORD", limit: "100", offset: "0" }).toString()}`
            ),
        enabled: draft.kind === "HINT",
        staleTime: 15_000,
    })
    const keywordOptions = (keywordList.data?.items ?? []).filter(
        (keyword) => keyword.status !== "ARCHIVED" || keyword.id === draft.keywordId
    )

    const payload = buildPayload(draft)
    const textOk = draft.questionText.trim().length > 0
    const dirty =
        row === null
            ? textOk && payload !== null
            : draft.kind !== row.kind ||
            draft.questionText.trim() !== row.questionText ||
            draft.domain.trim() !== (row.domain ?? "") ||
            draft.keywordId !== (row.keywordId ?? "") ||
            draft.timeLimit !== (row.timeLimit != null ? String(row.timeLimit) : "") ||
            JSON.stringify(payload) !== JSON.stringify(row.payload)
    const reason =
        !textOk || payload === null
            ? row
                ? "Fill the required fields"
                : "Question and an answer are required"
            : draft.kind === "HINT" && !draft.keywordId
                ? "Choose the keyword set this hint joins"
                : hintCapFull
                    ? `This set already holds ${HINT_MAX}/${HINT_MAX} hints — convert or archive one first`
                    : !dirty
                        ? "No changes to save"
                        : null

    const save = useMutation({
        mutationFn: () => {
            const body: Record<string, unknown> = {
                questionText: draft.questionText.trim(),
                domain: draft.domain.trim() || null,
                payload,
            }
            if (row) {
                // The only kind change the service accepts is TEXT ↔ HINT.
                if (draft.kind !== row.kind) body.kind = draft.kind
                body.keywordId = draft.kind === "HINT" ? draft.keywordId || null : null
                body.timeLimit = draft.timeLimit ? Number(draft.timeLimit) : null
                return api(`/portal/questions/${row.id}`, { method: "PATCH", body: JSON.stringify(body) })
            }
            body.kind = draft.kind
            if (draft.kind === "HINT") body.keywordId = draft.keywordId || undefined
            if (draft.timeLimit) body.timeLimit = Number(draft.timeLimit)
            return api("/portal/questions", { method: "POST", body: JSON.stringify(body) })
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["question-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-list"] })
            onClose()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    const toggleCorrect = (id: string) =>
        patch({ correct: draft.correct.includes(id) ? draft.correct.filter((c) => c !== id) : [...draft.correct, id] })

    const setNorm = (key: keyof Normalize, value: boolean) => patch({ norm: { ...draft.norm, [key]: value } })

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose()
            }}
        >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{row ? "Edit question" : "New question"}</DialogTitle>
                    <DialogDescription>
                        {row
                            ? "Changes apply to the bank; assembled matches keep their frozen copy."
                            : presetKind === "HINT"
                                ? "A hint for a keyword's set — the keyword is linked in the form."
                                : "A bank question for the global bank."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium" htmlFor="q-kind">Kind</label>
                        <select
                            id="q-kind"
                            value={draft.kind}
                            disabled={row !== null && row.kind !== "TEXT" && row.kind !== "HINT"}
                            title={
                                row
                                    ? row.kind === "TEXT" || row.kind === "HINT"
                                        ? "TEXT and HINT may be converted into each other"
                                        : "The kind cannot change after creation"
                                    : undefined
                            }
                            onChange={(event) => patch({ kind: event.target.value as Kind })}
                            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="TEXT">TEXT — typed answer</option>
                            {row === null && <option value="MC">MC — multiple choice</option>}
                            {row === null && <option value="KEYWORD">KEYWORD — the giai mã keyword</option>}
                            {(row !== null || presetKind === "HINT") && (
                                <option value="HINT">HINT — the giai mã hint</option>
                            )}
                            {row !== null && row.kind !== "TEXT" && row.kind !== "HINT" && (
                                <option value={row.kind}>
                                    {row.kind === "MC" ? "MC — multiple choice" : "KEYWORD — the giai mã keyword"}
                                </option>
                            )}
                        </select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm font-medium" htmlFor="q-text">Question</label>
                        <textarea
                            id="q-text"
                            value={draft.questionText}
                            onChange={(event) => patch({ questionText: event.target.value })}
                            rows={3}
                            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-domain">
                                Board category (optional)
                            </label>
                            <Input
                                id="q-domain"
                                value={draft.domain}
                                onChange={(event) => patch({ domain: event.target.value })}
                                placeholder="e.g. THTH — the ve-dich board column"
                                maxLength={64}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-limit">Time limit (s, optional)</label>
                            <Input
                                id="q-limit"
                                type="number"
                                min={1}
                                value={draft.timeLimit}
                                onChange={(event) => patch({ timeLimit: event.target.value })}
                                placeholder="—"
                            />
                        </div>
                    </div>

                    {/* ── the answer, shaped by the kind ── */}
                    {draft.kind === "MC" && (
                        <div className="grid gap-2">
                            <span className="text-sm font-medium">Options · tick the correct one(s)</span>
                            {draft.options.map((option, index) => (
                                <div key={option.id} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={draft.correct.includes(option.id)}
                                        onChange={() => toggleCorrect(option.id)}
                                        aria-label={`Option ${String.fromCharCode(65 + index)} correct`}
                                        className="size-4 shrink-0"
                                    />
                                    <span className="w-4 shrink-0 text-sm font-semibold text-muted-foreground">
                                        {String.fromCharCode(65 + index)}
                                    </span>
                                    <Input
                                        value={option.text}
                                        onChange={(event) =>
                                            patch({
                                                options: draft.options.map((o) =>
                                                    o.id === option.id ? { ...o, text: event.target.value } : o
                                                ),
                                            })
                                        }
                                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={draft.options.length <= 1}
                                        title={draft.options.length <= 1 ? "A question needs at least one option" : "Remove this option"}
                                        onClick={() => {
                                            patch({
                                                options: draft.options.filter((o) => o.id !== option.id),
                                                correct: draft.correct.filter((id) => id !== option.id),
                                            })
                                        }}
                                    >
                                        ✕
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                className="justify-start"
                                onClick={() =>
                                    patch({ options: [...draft.options, { id: nextOptionId(draft.options.map((o) => o.id)), text: "" }] })
                                }
                            >
                                <Plus className="size-4" aria-hidden /> Add option
                            </Button>
                            {payload === null && (
                                <p className="text-xs text-destructive">Give at least one option a text.</p>
                            )}
                        </div>
                    )}

                    {(draft.kind === "TEXT" || draft.kind === "HINT") && (
                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-accepted">
                                Accepted answers · one per line
                            </label>
                            <textarea
                                id="q-accepted"
                                value={draft.accepted}
                                onChange={(event) => patch({ accepted: event.target.value })}
                                rows={3}
                                placeholder={"Hoàng thành Thăng Long\nThăng Long"}
                                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                            />
                            <NormalizeRow norm={draft.norm} onSet={setNorm} />
                            {draft.kind === "HINT" && (
                                <div className="grid gap-1 border-t pt-2">
                                    <label className="text-sm font-medium" htmlFor="q-set">
                                        Set · the keyword this hint joins
                                    </label>
                                    <select
                                        id="q-set"
                                        value={draft.keywordId}
                                        onChange={(event) => patch({ keywordId: event.target.value })}
                                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                    >
                                        <option value="">Choose a keyword…</option>
                                        {keywordOptions.map((keyword) => (
                                            <option key={keyword.id} value={keyword.id}>
                                                {(keyword.payload as { code?: string }).code || keyword.questionText}
                                            </option>
                                        ))}
                                    </select>
                                    {keywordList.data && keywordOptions.length === 0 && (
                                        <span className="text-xs text-amber-600 dark:text-amber-500">
                                            No KEYWORD question exists yet — create the keyword first.
                                        </span>
                                    )}
                                    {hintPool.data && draft.keywordId && (
                                        <span
                                            className={cn("text-xs", hintCapFull ? "text-destructive" : "text-muted-foreground")}
                                        >
                                            {otherHints}/{HINT_MAX} hints in this set
                                            {hintCapFull ? " — convert or archive one first." : ""}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {draft.kind === "KEYWORD" && (
                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-code">
                                Keyword (mật mã)
                            </label>
                            <Input
                                id="q-code"
                                value={draft.code}
                                onChange={(event) => patch({ code: event.target.value })}
                                placeholder="the secret keyword"
                            />
                            <p className="text-xs text-muted-foreground">
                                Players type this keyword into the Giải Mã box; the prompt above is what they see.
                                Matching uses the checkboxes below.
                            </p>
                            <NormalizeRow norm={draft.norm} onSet={setNorm} />
                        </div>
                    )}

                    {error && (
                        <p role="alert" className="text-sm text-destructive">{error}</p>
                    )}
                </div>

                <DialogFooter className="items-center gap-2">
                    <span className="mr-auto text-xs text-muted-foreground">{reason}</span>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={reason !== null || save.isPending}
                        title={reason ?? undefined}
                        onClick={() => save.mutate()}
                    >
                        {save.isPending ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function NormalizeRow({ norm, onSet }: { norm: Normalize; onSet: (key: keyof Normalize, value: boolean) => void }) {
    return (
        <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={norm.trim} onChange={(e) => onSet("trim", e.target.checked)} className="size-4" />
                Ignore surrounding spaces
            </label>
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={norm.stripAccents} onChange={(e) => onSet("stripAccents", e.target.checked)} className="size-4" />
                Ignore accents
            </label>
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={norm.caseSensitive} onChange={(e) => onSet("caseSensitive", e.target.checked)} className="size-4" />
                Case sensitive
            </label>
        </div>
    )
}

// ── the page ──────────────────────────────────────────────────────────────────

export function QuestionsPage() {
    const queryClient = useQueryClient()
    const { data: me } = useMe()

    const [state, setState] = useState<UrlState>(() => readUrlState())
    const [searchInput, setSearchInput] = useState(() => state.search)

    // update() applies a filter change and always returns to the first page;
    // the offset moves only through explicit pagination calls.
    const update = (patch: Partial<UrlState>) =>
        setState((current) => ({ ...current, ...patch, offset: patch.offset ?? 0 }))

    // Debounced search: typing narrows the view after a pause; Enter applies
    // the search immediately (the effect then finds nothing left to do).
    useEffect(() => {
        if (searchInput.trim() === state.search) return
        const timer = setTimeout(() => update({ search: searchInput.trim() }), 350)
        return () => clearTimeout(timer)
    }, [searchInput, state.search])

    // The URL is the bookmark of this view (no Router on this page — the test
    // harness mounts it bare, and replaceState keeps the SPA router undisturbed).
    useEffect(() => {
        const params = new URLSearchParams()
        params.set("kind", state.kind)
        if (state.status !== "ALL") params.set("status", state.status)
        if (state.search) params.set("search", state.search)
        if (state.offset > 0) params.set("offset", String(state.offset))
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

    // Tab counts follow the active filters (status/tag/search, not kind).
    const countFilters = JSON.stringify({ status: state.status, search: state.search })
    const counts = useQuery({
        queryKey: ["question-counts", countFilters],
        queryFn: async () => {
            const totals = await Promise.all(
                TAB_KINDS.map((tab) => {
                    const params = new URLSearchParams({ limit: "1", offset: "0", kind: tab })
                    if (state.status !== "ALL") params.set("status", state.status)
                    if (state.search) params.set("search", state.search)
                    return api<Paged>(`/portal/questions?${params.toString()}`)
                })
            )
            const result = Object.fromEntries(
                TAB_KINDS.map((tab, index) => [tab, totals[index].total])
            ) as Record<TabKind, number>
            return result
        },
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    })

    const [flash, setFlash] = useState<{ id: string; message: string } | null>(null)
    const [confirming, setConfirming] = useState<BankQuestion | null>(null)

    const transition = useMutation({
        mutationFn: (input: { id: string; to: Status }) =>
            api(`/portal/questions/${input.id}/status`, { method: "PATCH", body: JSON.stringify({ status: input.to }) }),
        onSuccess: () => {
            setFlash(null)
            setConfirming(null)
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["question-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
        },
        onError: (cause, input) => setFlash({ id: input.id, message: messageOf(cause) }),
    })

    const [editing, setEditing] = useState<{
        open: boolean
        row: BankQuestion | null
        presetKeywordId?: string
        presetKind?: Kind
    }>({
        open: false,
        row: null,
    })
    const [previewing, setPreviewing] = useState<BankQuestion | null>(null)
    const [importOpen, setImportOpen] = useState(false)

    // ARCHIVED is terminal — it goes through the confirmation that states the
    // invariant; every other step is a one-click row operation.
    const requestTransition = (row: BankQuestion, to: Status) => {
        if (to === "ARCHIVED") {
            setConfirming(row)
            return
        }
        transition.mutate({ id: row.id, to })
    }

    // "Add hint" lands on the set's card (KEYWORD tab) and opens the dialog with
    // HINT preselected and the link already set — a hint is born from its
    // keyword, never from the global New question button.
    const addHint = (keywordId: string, openDialog = true) => {
        update({ kind: "KEYWORD" })
        if (openDialog) setEditing({ open: true, row: null, presetKeywordId: keywordId, presetKind: "HINT" })
    }

    const isAdmin = me?.role === "ADMIN"
    const rows = list.data?.items ?? []


    const emptyDescription = () => {
        if (searchInput.trim() || state.status !== "ALL") {
            return "Loosen the filters, or author the first one."
        }
        return `The bank has no ${state.kind} questions yet — author the first one.`
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

            {/* filters — read controls, not a form: they query on change */}
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

                {TAB_KINDS.map((tab) => {
                    const active = state.kind === tab
                    const count = counts.data?.[tab]
                    return (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={active}
                            onClick={() => update({ kind: tab })}
                            className={cn(
                                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                                active
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "bg-background hover:bg-muted"
                            )}
                        >
                            {tab}
                            {count !== undefined && (
                                <span className="ml-1.5 text-xs font-normal opacity-70">{count}</span>
                            )}
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

            {list.data && rows.length > 0 && state.kind === "MC" && (
                <div className="grid gap-3">
                    {rows.map((row) => (
                        <McCard
                            key={row.id}
                            row={row}
                            isAdmin={isAdmin}
                            busy={transition.isPending}
                            flash={flash}
                            onEdit={(target) => setEditing({ open: true, row: target })}
                            onPreview={setPreviewing}
                            onTransition={requestTransition}
                        />
                    ))}
                </div>
            )}

            {list.data && rows.length > 0 && state.kind === "KEYWORD" && (
                <div className="grid gap-4">
                    {rows.map((row) => (
                        <KeywordSetCard
                            key={row.id}
                            row={row}
                            isAdmin={isAdmin}
                            busy={transition.isPending}
                            flash={flash}
                            onEdit={(target) => setEditing({ open: true, row: target })}
                            onPreview={setPreviewing}
                            onTransition={requestTransition}
                            onAddHint={addHint}
                        />
                    ))}
                </div>
            )}

            {list.data && rows.length > 0 && state.kind === "TEXT" && (
                <QuestionTable
                    rows={rows}
                    showKind={state.kind === "TEXT"}
                    isAdmin={isAdmin}
                    busy={transition.isPending}
                    flash={flash}
                    onEdit={(row) => setEditing({ open: true, row })}
                    onPreview={setPreviewing}
                    onTransition={requestTransition}
                />
            )}

            {list.data && list.data.total > LIMIT && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        {state.offset + 1}–{Math.min(state.offset + LIMIT, list.data.total)} of {list.data.total}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={state.offset === 0}
                            onClick={() => update({ offset: Math.max(0, state.offset - LIMIT) })}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={state.offset + LIMIT >= list.data.total}
                            onClick={() => update({ offset: state.offset + LIMIT })}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {editing.open && (
                <QuestionDialog
                    key={editing.row?.id ?? "new"}
                    row={editing.row}
                    presetKeywordId={editing.presetKeywordId}
                    presetKind={editing.presetKind}
                    open={editing.open}
                    onClose={() => setEditing({ open: false, row: null })}
                />
            )}

            {previewing && <PreviewDialog row={previewing} onClose={() => setPreviewing(null)} />}

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
        </Page>
    )
}
