import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Database, Eye, EyeOff, Link2, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react"
import { cn } from "cn"
import { ApiError, api } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { ErrorPanel } from "@/components/page"
import { useMe } from "@/lib/session"
import { useMatches } from "@/lib/tournament"
import { useTournaments } from "@/lib/tournaments"

interface StagedBatch {
    id: string
    sourceName: string | null
    rowCount: number
    ready: number
    toFix: number
    dropped: number
    remaining: number
    createdAt: string
}

interface SourceCells {
    question: string
    answer: string
    explanation: string
    note: string
    media: string
}

interface StagedRow {
    id: string
    position: number
    sheet: string
    sourceId: string
    cells: SourceCells
    media: { url: string; type: "image" | "audio" | "video" } | null
    error: string | null
    warning: string | null
    dropped: boolean
    bucket: string | null
    kind: string | null
}

interface CommitResult {
    created: number
    ids: string[]
    errors: Array<{ index: number; code: string; message: string; details: string[] }>
    assemblyRevision?: number
}

const SHEETS = ["KHOI_DONG", "GIAI_MA", "BUT_PHA", "VE_DICH"] as const

const EMPTY_CELLS: SourceCells = { question: "", answer: "", explanation: "", note: "", media: "" }

const CELL_FIELDS: Array<{ key: keyof SourceCells; label: string }> = [
    { key: "question", label: "Câu hỏi" },
    { key: "answer", label: "Đáp án" },
    { key: "explanation", label: "Giải thích" },
    { key: "note", label: "Ghi chú" },
    { key: "media", label: "File ảnh/video/audio" },
]

function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Something went wrong. Please try again."
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
    void queryClient.invalidateQueries({ queryKey: ["questions"] })
    void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
    void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
    void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
    void queryClient.invalidateQueries({ queryKey: ["keyword-list"] })
}


function StagedRowItem({
    batchId,
    row,
    onChanged,
}: {
    batchId: string
    row: StagedRow
    onChanged: () => void
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState<SourceCells>(row.cells)
    const [error, setError] = useState<string | null>(null)

    const patch = useMutation({
        mutationFn: (body: Partial<{ cells: SourceCells; dropped: boolean }>) =>
            api<StagedRow>(`/portal/question-imports/${batchId}/rows/${row.id}`, {
                method: "PATCH",
                body: JSON.stringify(body),
            }),
        onSuccess: () => {
            setEditing(false)
            setError(null)
            onChanged()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    const toggleDrop = () => patch.mutate({ dropped: !row.dropped })

    return (
        <li
            className={cn(
                "rounded-lg border bg-background/60 px-3 py-2",
                row.dropped && "opacity-50",
                row.error && "border-destructive/40"
            )}
        >
            <div className="flex flex-wrap items-start gap-2 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                    {row.sheet}
                </span>
                <span className="w-24 shrink-0 font-mono text-xs">{row.sourceId}</span>

                {editing ? (
                    <div className="grid min-w-64 flex-1 gap-2">
                        {CELL_FIELDS.map((field) => (
                            <label key={field.key} className="grid gap-0.5 text-xs">
                                <span className="text-muted-foreground">{field.label}</span>
                                <input
                                    value={draft[field.key]}
                                    onChange={(event) =>
                                        setDraft({ ...draft, [field.key]: event.target.value })
                                    }
                                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                                />
                            </label>
                        ))}
                        <div className="flex justify-end gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                aria-label="Hủy"
                                title="Hủy"
                                onClick={() => {
                                    setDraft(row.cells)
                                    setEditing(false)
                                    setError(null)
                                }}
                            >
                                <X className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                                size="sm"
                                aria-label="Lưu"
                                title="Lưu"
                                disabled={patch.isPending}
                                onClick={() => patch.mutate({ cells: draft })}
                            >
                                <Save className="size-3.5" aria-hidden />
                            </Button>
                        </div>
                        {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                ) : (
                    <>
                        <div className="min-w-0 flex-1">
                            <span className="block truncate font-medium" title={row.cells.question}>
                                {row.cells.question}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground" title={row.cells.answer}>
                                {row.cells.answer && `→ ${row.cells.answer}`}
                            </span>
                            {row.media && (
                                <span className="block truncate text-xs text-muted-foreground">
                                    📎 {row.media.url}
                                </span>
                            )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                            <div className="flex flex-wrap justify-end gap-1">
                                {row.bucket && <Badge variant="secondary">{row.bucket}</Badge>}
                                {row.kind && <Badge variant="outline">{row.kind}</Badge>}
                            </div>
                            {row.error && (
                                <span className="max-w-72 text-right text-xs text-destructive" title={row.error}>
                                    {row.error}
                                </span>
                            )}
                            {!row.error && row.warning && (
                                <span
                                    className="max-w-72 text-right text-xs text-amber-700 dark:text-amber-500"
                                    title={row.warning}
                                >
                                    {row.warning}
                                </span>
                            )}
                        </div>

                        <div className="flex shrink-0 gap-1.5">
                            <Button
                                size="sm"
                                variant="outline"
                                aria-label="Sửa"
                                title="Sửa"
                                disabled={patch.isPending || row.dropped}
                                onClick={() => {
                                    setDraft(row.cells)
                                    setEditing(true)
                                }}
                            >
                                <Pencil className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                aria-label={row.dropped ? "Trở lại" : "Bỏ"}
                                title={row.dropped ? "Trở lại" : "Bỏ"}
                                disabled={patch.isPending}
                                onClick={toggleDrop}
                            >
                                {row.dropped ? (
                                    <RotateCcw className="size-3.5" aria-hidden />
                                ) : (
                                    <Trash2 className="size-3.5" aria-hidden />
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </li>
    )
}


function AddRowForm({ batchId, onAdded }: { batchId: string; onAdded: () => void }) {
    const [open, setOpen] = useState(false)
    const [sheet, setSheet] = useState<string>(SHEETS[0])
    const [sourceId, setSourceId] = useState("")
    const [draft, setDraft] = useState<SourceCells>(EMPTY_CELLS)
    const [error, setError] = useState<string | null>(null)

    const add = useMutation({
        mutationFn: () =>
            api<StagedRow>(`/portal/question-imports/${batchId}/rows`, {
                method: "POST",
                body: JSON.stringify({ sheet, sourceId, cells: draft }),
            }),
        onSuccess: () => {
            setOpen(false)
            setSourceId("")
            setDraft(EMPTY_CELLS)
            setError(null)
            onAdded()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    if (!open) {
        return (
            <Button
                size="sm"
                variant="outline"
                aria-label="Thêm row"
                title="Thêm row"
                onClick={() => setOpen(true)}
            >
                <Plus className="size-3.5" aria-hidden />
            </Button>
        )
    }

    return (
        <div className="grid gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap gap-2">
                <select
                    value={sheet}
                    onChange={(event) => setSheet(event.target.value)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                    {SHEETS.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
                <input
                    value={sourceId}
                    onChange={(event) => setSourceId(event.target.value)}
                    placeholder="ID (VD: GM_KEY)"
                    className="h-8 w-40 rounded-lg border border-input bg-transparent px-2 text-sm font-mono"
                />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                <input
                    value={draft.question}
                    onChange={(event) => setDraft({ ...draft, question: event.target.value })}
                    placeholder="Câu hỏi"
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                />
                <input
                    value={draft.answer}
                    onChange={(event) => setDraft({ ...draft, answer: event.target.value })}
                    placeholder="Đáp án"
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    aria-label="Hủy"
                    title="Hủy"
                    onClick={() => { setOpen(false); setError(null) }}
                >
                    <X className="size-3.5" aria-hidden />
                </Button>
                <Button
                    size="sm"
                    aria-label="Thêm"
                    title="Thêm"
                    disabled={add.isPending || !sourceId.trim() || !draft.question.trim()}
                    onClick={() => add.mutate()}
                >
                    <Plus className="size-3.5" aria-hidden />
                </Button>
            </div>
        </div>
    )
}


function CommitToMatchDialog({
    batchId,
    onCommitted,
    onClose,
}: {
    batchId: string
    onCommitted: () => void
    onClose: () => void
}) {
    const queryClient = useQueryClient()
    const [tournamentId, setTournamentId] = useState("")
    const [matchId, setMatchId] = useState("")
    const [error, setError] = useState<string | null>(null)

    const tournaments = useTournaments({ limit: 50 })
    const matches = useMatches(tournamentId)
    const upcoming = (matches.data?.items ?? []).filter((match) => match.status === "UPCOMING")

    const commit = useMutation({
        mutationFn: () =>
            api<CommitResult>(`/portal/question-imports/${batchId}/commit-to-match`, {
                method: "POST",
                body: JSON.stringify({ tournamentId, matchId }),
            }),
        onSuccess: () => {
            invalidateAll(queryClient)
            void queryClient.invalidateQueries({ queryKey: ["matches"] })
            onCommitted()
            onClose()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    const ready = Boolean(tournamentId && matchId)

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Commit vào trận</DialogTitle>
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
                                    {match.label} · {match.stageId}
                                </option>
                            ))}
                        </select>
                    </label>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter className="items-center gap-2">
                    <Button variant="outline" aria-label="Hủy" title="Hủy" onClick={onClose} disabled={commit.isPending}>
                        <X className="size-4" aria-hidden />
                    </Button>
                    <Button
                        aria-label="Commit vào trận"
                        title="Commit vào trận"
                        disabled={!ready || commit.isPending}
                        onClick={() => commit.mutate()}
                    >
                        <Link2 className="size-4" aria-hidden />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


function StagedGrid({ batch, onChanged }: { batch: StagedBatch; onChanged: () => void }) {
    const queryClient = useQueryClient()
    const { data: me } = useMe()
    const [committingToMatch, setCommittingToMatch] = useState(false)
    const [commitError, setCommitError] = useState<string | null>(null)

    const rows = useQuery({
        queryKey: ["question-imports", batch.id, "rows"],
        queryFn: () => api<{ items: StagedRow[] }>(`/portal/question-imports/${batch.id}/rows`),
        staleTime: 5_000,
    })

    const commit = useMutation({
        mutationFn: () =>
            api<CommitResult>(`/portal/question-imports/${batch.id}/commit`, { method: "POST" }),
        onSuccess: (result) => {
            if (result.errors.length > 0) {
                setCommitError(result.errors.map((failure) => failure.message).join(" · "))
                onChanged()
                return
            }
            setCommitError(null)
            invalidateAll(queryClient)
        },
        onError: (cause) => setCommitError(messageOf(cause)),
    })

    const items = rows.data?.items ?? []
    const live = items.filter((row) => !row.dropped)
    const toFix = live.filter((row) => row.error).length
    const ready = live.length - toFix

    return (
        <div className="mt-3 grid gap-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{ready} câu sẵn sàng</span>
                {toFix > 0 && (
                    <span className="text-destructive">{toFix} cần sửa</span>
                )}
                {batch.dropped > 0 && (
                    <span className="text-muted-foreground">{batch.dropped} đã bỏ</span>
                )}
            </div>

            {rows.isError && <ErrorPanel message={messageOf(rows.error)} />}

            {items.length > 0 && (
                <ul className="grid gap-1.5">
                    {items.map((row) => (
                        <StagedRowItem
                            key={row.id}
                            batchId={batch.id}
                            row={row}
                            onChanged={() =>
                                void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
                            }
                        />
                    ))}
                </ul>
            )}

            <AddRowForm
                batchId={batch.id}
                onAdded={() =>
                    void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
                }
            />

            {commitError && <p className="text-sm text-destructive">{commitError}</p>}

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    aria-label={`Commit ${live.length} câu vào bank (DRAFT)`}
                    title={`Commit ${live.length} câu vào bank (DRAFT)`}
                    disabled={commit.isPending || live.length === 0 || toFix > 0}
                    onClick={() => commit.mutate()}
                >
                    <Database className="size-4" aria-hidden />
                </Button>
                {me?.role === "ADMIN" && (
                    <Button
                        variant="outline"
                        aria-label="Commit vào trận…"
                        title="Commit vào trận…"
                        disabled={commit.isPending || live.length === 0 || toFix > 0}
                        onClick={() => setCommittingToMatch(true)}
                    >
                        <Link2 className="size-4" aria-hidden />
                    </Button>
                )}
            </div>

            {committingToMatch && (
                <CommitToMatchDialog
                    batchId={batch.id}
                    onCommitted={onChanged}
                    onClose={() => setCommittingToMatch(false)}
                />
            )}
        </div>
    )
}


export function StagedImportBanner() {
    const queryClient = useQueryClient()
    const [open, setOpen] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const [discardError, setDiscardError] = useState<string | null>(null)

    const imports = useQuery({
        queryKey: ["question-imports"],
        queryFn: () =>
            api<{ active: StagedBatch | null; batches: StagedBatch[] }>("/portal/question-imports"),
        staleTime: 5_000,
    })

    const discard = useMutation({
        mutationFn: (batchId: string) =>
            api<void>(`/portal/question-imports/${batchId}`, { method: "DELETE" }),
        onMutate: () => setDiscardError(null),
        onSuccess: () => {
            setConfirmDiscard(false)
            setOpen(false)
            setDiscardError(null)
            void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
        },
        onError: (cause) => setDiscardError(messageOf(cause)),
    })

    const active = imports.data?.active
    if (!active) return null

    const changed = () => void queryClient.invalidateQueries({ queryKey: ["question-imports"] })

    return (
        <div className="rounded-xl border border-amber-600/40 bg-amber-500/10 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Staged import</span>
                <span className="text-sm text-muted-foreground">
                    {active.sourceName ?? "workbook"} · {active.rowCount} rows
                </span>
                {active.toFix > 0 ? (
                    <Badge variant="destructive">{active.toFix} cần sửa</Badge>
                ) : (
                    <Badge variant="secondary">{active.ready} sẵn sàng</Badge>
                )}
                {active.dropped > 0 && (
                    <Badge variant="outline">{active.dropped} đã bỏ</Badge>
                )}

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        aria-label={open ? "Ẩn" : "Review"}
                        title={open ? "Ẩn" : "Review"}
                        onClick={() => setOpen((value) => !value)}
                    >
                        {open ? (
                            <EyeOff className="size-4" aria-hidden />
                        ) : (
                            <Eye className="size-4" aria-hidden />
                        )}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Bỏ batch"
                        title="Bỏ batch"
                        disabled={discard.isPending}
                        onClick={() => setConfirmDiscard(true)}
                    >
                        <Trash2 className="size-4" aria-hidden />
                    </Button>
                </div>
            </div>

            {discardError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                    Không bỏ được batch — {discardError}
                </p>
            )}

            {open && <StagedGrid batch={active} onChanged={changed} />}

            {confirmDiscard && (
                <Dialog open onOpenChange={(next) => { if (!next) setConfirmDiscard(false) }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Bỏ batch này?</DialogTitle>
                        </DialogHeader>
                        <DialogFooter className="items-center gap-2">
                            <Button
                                variant="outline"
                                aria-label="Hủy"
                                title="Hủy"
                                onClick={() => setConfirmDiscard(false)}
                            >
                                <X className="size-4" aria-hidden />
                            </Button>
                            <Button
                                variant="destructive"
                                aria-label="Bỏ batch"
                                title="Bỏ batch"
                                disabled={discard.isPending}
                                onClick={() => discard.mutate(active.id)}
                            >
                                <Trash2 className="size-4" aria-hidden />
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}
