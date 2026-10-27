import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText, Pencil, Plus } from "lucide-react"
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

// The question bank — a READ surface with every change in a dialog (the
// ui-patterns.md rule): browse/filter here, author/edit only inside the dialog,
// status moves are explicit row actions (operations, not forms). One Save per
// dialog; the draft is derived from the server row when the dialog opens and
// Cancel discards it.
//
// Status workflow (backend `transitions.ts`):
//   DRAFT → PENDING | ARCHIVED · PENDING → DRAFT | PUBLISHED | ARCHIVED
//   PUBLISHED → PENDING | ARCHIVED · ARCHIVED → (terminal, immutable)
// Publishing is admin-only — the button says why when it is disabled.

type Kind = "MC" | "TEXT" | "KEYWORD"
type Status = "DRAFT" | "PENDING" | "PUBLISHED" | "ARCHIVED"

interface BankQuestion {
    id: string
    kind: Kind
    questionText: string
    tag: string
    status: Status
    timeLimit: number | null
    payload: Record<string, unknown>
    updatedAt: string
}

interface Page {
    items: BankQuestion[]
    total: number
}

const LIMIT = 20
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

// ── the edit draft ────────────────────────────────────────────────────────────

interface Normalize {
    caseSensitive: boolean
    trim: boolean
    stripAccents: boolean
}

interface Draft {
    kind: Kind
    questionText: string
    tag: string
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

// The dialog's draft is DERIVED from the server row — never a leftover.
function draftFrom(row: BankQuestion | null): Draft {
    const base: Draft = {
        kind: row?.kind ?? "TEXT",
        questionText: row?.questionText ?? "",
        tag: row?.tag ?? "",
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
    if (draft.kind === "TEXT") {
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

// ── the dialog ────────────────────────────────────────────────────────────────

function QuestionDialog({
    row,
    open,
    onClose,
}: {
    row: BankQuestion | null
    open: boolean
    onClose: () => void
}) {
    const queryClient = useQueryClient()
    const [draft, setDraft] = useState<Draft>(() => draftFrom(row))
    const [error, setError] = useState<string | null>(null)

    const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))

    const payload = buildPayload(draft)
    const textOk = draft.questionText.trim().length > 0 && draft.tag.trim().length > 0
    const dirty =
        row === null
            ? textOk && payload !== null
            : draft.questionText.trim() !== row.questionText ||
              draft.tag.trim() !== row.tag ||
              draft.timeLimit !== (row.timeLimit != null ? String(row.timeLimit) : "") ||
              JSON.stringify(payload) !== JSON.stringify(row.payload)
    const reason =
        !textOk || payload === null
            ? row
                ? "Fill the required fields"
                : "Question, tag and an answer are required"
            : !dirty
              ? "No changes to save"
              : null

    const save = useMutation({
        mutationFn: () => {
            const body: Record<string, unknown> = {
                questionText: draft.questionText.trim(),
                tag: draft.tag.trim(),
                payload,
            }
            if (row) {
                body.timeLimit = draft.timeLimit ? Number(draft.timeLimit) : null
                return api(`/portal/questions/${row.id}`, { method: "PATCH", body: JSON.stringify(body) })
            }
            body.kind = draft.kind
            if (draft.timeLimit) body.timeLimit = Number(draft.timeLimit)
            return api("/portal/questions", { method: "POST", body: JSON.stringify(body) })
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
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
                            : "A bank question. The tournament's tag filter decides which tournaments may assemble it."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium" htmlFor="q-kind">Kind</label>
                        <select
                            id="q-kind"
                            value={draft.kind}
                            disabled={row !== null}
                            title={row ? "The kind cannot change after creation" : undefined}
                            onChange={(event) => patch({ kind: event.target.value as Kind })}
                            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="TEXT">TEXT — typed answer</option>
                            <option value="MC">MC — multiple choice</option>
                            <option value="KEYWORD">KEYWORD — the giai mã keyword</option>
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
                            <label className="text-sm font-medium" htmlFor="q-tag">Tag</label>
                            <Input
                                id="q-tag"
                                value={draft.tag}
                                onChange={(event) => patch({ tag: event.target.value })}
                                placeholder="THTH"
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

                    {draft.kind === "TEXT" && (
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

    const [status, setStatus] = useState<Status | "ALL">("ALL")
    const [kind, setKind] = useState<Kind | "ALL">("ALL")
    const [searchInput, setSearchInput] = useState("")
    const [search, setSearch] = useState("")
    const [offset, setOffset] = useState(0)

    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) })
    if (status !== "ALL") params.set("status", status)
    if (kind !== "ALL") params.set("kind", kind)
    if (search) params.set("search", search)

    const list = useQuery({
        queryKey: ["questions", params.toString()],
        queryFn: () => api<Page>(`/portal/questions?${params.toString()}`),
    })

    const [flash, setFlash] = useState<{ id: string; message: string } | null>(null)
    const transition = useMutation({
        mutationFn: (input: { id: string; to: Status }) =>
            api(`/portal/questions/${input.id}/status`, { method: "PATCH", body: JSON.stringify({ status: input.to }) }),
        onSuccess: () => {
            setFlash(null)
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
        },
        onError: (cause, input) => setFlash({ id: input.id, message: messageOf(cause) }),
    })

    const [editing, setEditing] = useState<{ open: boolean; row: BankQuestion | null }>({ open: false, row: null })
    const resetOffset = () => setOffset(0)

    const isAdmin = me?.role === "ADMIN"

    return (
        <Page>
            <PageHeader
                title="Questions"
                description="The global question bank — what every tournament may assemble."
                actions={
                    <Button onClick={() => setEditing({ open: true, row: null })}>
                        <Plus className="size-4" aria-hidden /> New question
                    </Button>
                }
            />

            {/* filters — read controls, not a form: they query on change */}
            <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-sm">
                    Status
                    <select
                        value={status}
                        onChange={(event) => {
                            setStatus(event.target.value as Status | "ALL")
                            resetOffset()
                        }}
                        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    >
                        <option value="ALL">All</option>
                        <option value="DRAFT">Draft</option>
                        <option value="PENDING">In review</option>
                        <option value="PUBLISHED">Published</option>
                        <option value="ARCHIVED">Archived</option>
                    </select>
                </label>
                <label className="grid gap-1 text-sm">
                    Kind
                    <select
                        value={kind}
                        onChange={(event) => {
                            setKind(event.target.value as Kind | "ALL")
                            resetOffset()
                        }}
                        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    >
                        <option value="ALL">All</option>
                        <option value="TEXT">TEXT</option>
                        <option value="MC">MC</option>
                        <option value="KEYWORD">KEYWORD</option>
                    </select>
                </label>
                <form
                    className="flex items-end gap-2"
                    onSubmit={(event) => {
                        event.preventDefault()
                        setSearch(searchInput.trim())
                        resetOffset()
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
            </div>

            {list.isPending && <ListSkeleton />}
            {list.isError && <ErrorPanel message={messageOf(list.error)} />}

            {list.data && list.data.items.length === 0 && (
                <EmptyState
                    icon={FileText}
                    title="No questions match"
                    description={search || status !== "ALL" || kind !== "ALL"
                        ? "Loosen the filters, or author the first one."
                        : "The bank is empty — author the first question."}
                />
            )}

            {list.data && list.data.items.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Question</TableHead>
                                <TableHead className="w-20">Kind</TableHead>
                                <TableHead className="w-24">Tag</TableHead>
                                <TableHead className="w-28">Status</TableHead>
                                <TableHead className="w-28">Updated</TableHead>
                                <TableHead className="w-72 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.data.items.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="max-w-md">
                                        <span className="block truncate font-medium" title={row.questionText}>
                                            {row.questionText}
                                        </span>
                                        {flash?.id === row.id && (
                                            <span role="alert" className="block text-xs text-destructive">{flash.message}</span>
                                        )}
                                    </TableCell>
                                    <TableCell><Badge variant="outline">{row.kind}</Badge></TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{row.tag}</TableCell>
                                    <TableCell><StatusBadge status={row.status} /></TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {dateFormat.format(new Date(row.updatedAt))}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={row.status === "ARCHIVED"}
                                                title={row.status === "ARCHIVED" ? "Archived questions are immutable" : undefined}
                                                onClick={() => setEditing({ open: true, row })}
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
                                                        disabled={blocked || transition.isPending}
                                                        title={blocked ? "Only an admin may publish" : `Move to ${STATUS_LABEL[step.to]}`}
                                                        onClick={() => transition.mutate({ id: row.id, to: step.to })}
                                                    >
                                                        {step.label}
                                                    </Button>
                                                )
                                            })}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {list.data && list.data.total > LIMIT && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        {offset + 1}–{Math.min(offset + LIMIT, list.data.total)} of {list.data.total}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={offset === 0}
                            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={offset + LIMIT >= list.data.total}
                            onClick={() => setOffset(offset + LIMIT)}
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
                    open={editing.open}
                    onClose={() => setEditing({ open: false, row: null })}
                />
            )}
        </Page>
    )
}
