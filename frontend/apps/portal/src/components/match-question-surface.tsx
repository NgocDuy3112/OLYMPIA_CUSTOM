import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { arrayMove } from "@dnd-kit/sortable"
import { Pencil, RefreshCw, Upload, X } from "lucide-react"
import { ApiError, api, type PageResult } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import {
    BankPickerItem,
    ComposeDndProvider,
    ComposeGroup,
    type ComposeRow,
} from "@/components/compose-group"
import { ExcelImportDialog } from "@/components/excel-import-dialog"
import { useTournament, type MatchSummary, type RoundConfig } from "@/lib/tournament"


interface FrozenQuestion {
    _id?: string
    roundId: string
    turnId: string
    position?: number
    kind?: string
    questionText: string
    points?: number
    timeLimit?: number | null
    payload?: Record<string, unknown>
    sourceId?: string
}

interface Entry {
    roundId: string
    turnId: string
    sourceId: string
    points?: number
    questionText?: string
    kind?: string
    badge?: string
    position?: number
}

interface BankRow {
    id: string
    kind: string
    questionText: string
    tags?: string[]
    payload?: Record<string, unknown>
}


interface GroupDef {
    bucket: string
    label: string
    typeLabel?: string
    roundId: string
    turnId: string
    points?: number
}

interface TabDef {
    id: string
    label: string
    groups: GroupDef[]
}

const TABS: TabDef[] = [
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

const ALL_GROUPS = TABS.flatMap((tab) => tab.groups)
const BUCKET_TAGS = new Set(ALL_GROUPS.map((group) => group.bucket))
const VE_DICH_POINTS = new Set([20, 30, 40, 50])

const BOARD_COMPOSITION: Record<number, number> = { 20: 6, 30: 6, 40: 4, 50: 4 }
const DEFAULT_QUESTION_COUNTS: Record<string, Record<string, number>> = {
    "khoi-dong": { phase1: 6, phase2: 6 },
    "giai-ma": { phase1: 8 },
    "but-pha": { phase1: 4 },
}

function requiredFor(
    group: GroupDef,
    rules: Record<string, RoundConfig> | null | undefined,
    playerCount = 1
): number {
    if (group.points !== undefined) return BOARD_COMPOSITION[group.points] ?? 0
    const fromRules = rules?.[group.roundId]?.turns.find((turn) => turn.id === group.turnId)?.questionCount
    const base =
        typeof fromRules === "number"
            ? fromRules
            : DEFAULT_QUESTION_COUNTS[group.roundId]?.[group.turnId] ?? 0
    // Khởi động Riêng is ONE SET PER PLAYER (the engine hands seat 1 the first
    // six, seat 2 the next six), so the target scales with the seated count.
    // Chung stays a single shared set.
    if (group.bucket === "khoi-dong:rieng") return base * Math.max(1, playerCount)
    return base
}


function bucketOfEntry(question: { roundId: string; turnId?: string; points?: number }): string | null {
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
            return question.points !== undefined && VE_DICH_POINTS.has(question.points)
                ? `ve-dich:${question.points}`
                : null
        default:
            return null
    }
}

function bucketOfRow(row: BankRow): string | null {
    const tagged = (row.tags ?? []).find((tag) => BUCKET_TAGS.has(tag))
    if (tagged) return tagged
    const carrier = row.payload?.bucket
    if (typeof carrier === "string" && carrier.length > 0) return carrier
    if (row.kind === "KEYWORD" || row.kind === "HINT") return "giai-ma"
    return null
}

function badgeOfRow(row: Pick<BankRow, "kind" | "payload">): string {
    const declared = row.payload?.type
    if (typeof declared === "string" && declared.length > 0) return declared
    return row.kind === "HINT" ? "TEXT" : row.kind
}

function badgeOfFrozen(question: FrozenQuestion): string {
    const declared = question.payload?.type
    if (typeof declared === "string" && declared.length > 0) return declared
    if (question.kind === "KEYWORD") return "KEYWORD"
    if (question.kind === "HINT") return "Gợi ý"
    return question.kind ?? "TEXT"
}

function entryFromFrozen(question: FrozenQuestion, group?: GroupDef): Entry {
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

function bucketize(questions: FrozenQuestion[]): { groups: Record<string, Entry[]>; unplaced: Entry[] } {
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

function toComposeRows(entries: Entry[]): ComposeRow[] {
    const seen = new Map<string, number>()
    return entries.map((entry) => {
        const nth = (seen.get(entry.sourceId) ?? 0) + 1
        seen.set(entry.sourceId, nth)
        const bits: string[] = []
        if (entry.position !== undefined) bits.push(`#${entry.position + 1}`)
        if (entry.points !== undefined) bits.push(`${entry.points}đ`)
        return {
            id: `${entry.sourceId}~${nth}`,
            primary: entry.questionText || entry.sourceId,
            ...(bits.length > 0 ? { secondary: bits.join(" · ") } : {}),
            ...(entry.badge ? { badge: entry.badge } : {}),
        } satisfies ComposeRow
    })
}

function flatten(groups: Record<string, Entry[]>): Entry[] {
    return ALL_GROUPS.flatMap((group) => groups[group.bucket] ?? [])
}

function spliceInto(list: Entry[], index: number, entries: Entry[]): Entry[] {
    const next = [...list]
    next.splice(Math.max(0, Math.min(index, list.length)), 0, ...entries)
    return next
}

function diffCount(current: Entry[], original: Entry[]): number {
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

function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Có gì đó không ổn — thử lại."
}


export function MatchQuestionSurface({
    tournamentId,
    match,
}: {
    tournamentId: string
    match: MatchSummary
}) {
    const queryClient = useQueryClient()
    const { data: tournament } = useTournament(tournamentId)

    const questions = match.questions as FrozenQuestion[]
    const original = bucketize(questions)

    const [draft, setDraft] = useState<Record<string, Entry[]> | null>(null)
    const [tabId, setTabId] = useState(TABS[0].id)
    const [search, setSearch] = useState("")
    const [debounced, setDebounced] = useState("")
    const [flash, setFlash] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [conflict, setConflict] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [importOpen, setImportOpen] = useState(false)
    const [pendingAdd] = useState(() =>
        typeof window === "undefined"
            ? null
            : new URLSearchParams(window.location.search).get("add")
    )
    const addStartedRef = useRef(false)

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(search.trim()), 300)
        return () => clearTimeout(timer)
    }, [search])

    const detail = useQuery({
        queryKey: ["match-detail", tournamentId, match.id],
        queryFn: () =>
            api<MatchSummary>(`/portal/tournaments/${tournamentId}/matches/${match.id}`),
        staleTime: 15_000,
    })
    const lastEvent = detail.data?.assemblyEvents?.[0]

    const editable = draft !== null
    const shown = draft ?? original.groups
    const tab = TABS.find((candidate) => candidate.id === tabId) ?? TABS[0]
    const rules = tournament?.roundRules

    const pickerKind = tab.id === "giai-ma" ? "KEYWORD" : "TEXT"
    const eligible = useQuery({
        queryKey: ["eligible", tournamentId, tab.id, pickerKind, debounced],
        queryFn: () => {
            const params = new URLSearchParams({
                kinds: pickerKind,
                bucket: tab.id,
                limit: "200",
                offset: "0",
            })
            if (debounced) params.set("search", debounced)
            return api<PageResult<BankRow>>(
                `/portal/tournaments/${tournamentId}/eligible-questions?${params.toString()}`
            )
        },
        enabled: editable,
        staleTime: 10_000,
    })
    const pickerRows = eligible.data?.items ?? []


    const enterCompose = () => {
        setDraft(bucketize(questions).groups)
        setFlash(null)
        setSaveError(null)
        setConflict(null)
        setNotice(null)
    }

    const insertRow = useCallback(
        async (row: BankRow, targetBucket: string, index: number): Promise<void> => {
            const group = ALL_GROUPS.find((candidate) => candidate.bucket === targetBucket)
            if (!group) return

            const base: Entry = {
                roundId: group.roundId,
                turnId: group.turnId,
                sourceId: row.id,
                questionText: row.questionText,
                kind: row.kind,
                badge: badgeOfRow(row),
                ...(group.points !== undefined ? { points: group.points } : {}),
            }

            let entries: Entry[] = [base]
            if (targetBucket === "giai-ma" && row.kind === "KEYWORD") {
                const hints = await api<PageResult<BankRow>>(
                    `/portal/questions?${new URLSearchParams({
                        kind: "HINT",
                        keywordId: row.id,
                        limit: "100",
                        offset: "0",
                    }).toString()}`
                )
                entries = [
                    base,
                    ...hints.items.map((hint) => ({
                        roundId: group.roundId,
                        turnId: group.turnId,
                        sourceId: hint.id,
                        questionText: hint.questionText,
                        kind: "HINT",
                        badge: "Gợi ý",
                    })),
                ]
            }

            setDraft((current) =>
                current
                    ? {
                          ...current,
                          [targetBucket]: spliceInto(current[targetBucket] ?? [], index, entries),
                      }
                    : current
            )
        },
        []
    )

    const handleAdd = (sourceId: string, bucket: string, index: number) => {
        if (!draft) return
        const row = pickerRows.find((candidate) => candidate.id === sourceId)
        if (!row) return

        const ownBucket = bucketOfRow(row)
        if (ownBucket && ownBucket !== bucket) {
            setFlash(`Câu này thuộc nhóm ${ownBucket} — không vào được ${bucket}.`)
            return
        }

        void insertRow(row, bucket, index).catch((error) => setSaveError(messageOf(error)))
    }

    useEffect(() => {
        if (!pendingAdd || addStartedRef.current) return
        addStartedRef.current = true

        const clearParam = () => {
            window.history.replaceState(
                null,
                "",
                window.location.pathname + window.location.hash
            )
        }
        const ids = pendingAdd
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        if (ids.length === 0) {
            clearParam()
            return
        }

        void (async () => {
            if (match.status !== "UPCOMING") {
                setFlash("Trận không còn UPCOMING — không thêm được câu mới.")
                clearParam()
                return
            }
            try {
                const page = await api<PageResult<BankRow>>(
                    `/portal/questions?${new URLSearchParams({
                        ids: ids.join(","),
                        limit: "50",
                        offset: "0",
                    }).toString()}`
                )
                const placed: Array<{ row: BankRow; bucket: string }> = []
                const skipped: string[] = []
                for (const row of page.items) {
                    const bucket = bucketOfRow(row)
                    if (bucket && BUCKET_TAGS.has(bucket)) placed.push({ row, bucket })
                    else skipped.push(row.questionText || row.id)
                }
                if (placed.length === 0) {
                    setFlash(
                        skipped.length > 0
                            ? "Câu chưa gán nhóm — gán nhóm trước khi thêm vào trận."
                            : "Không tìm thấy câu cần thêm."
                    )
                    return
                }

                setDraft(bucketize(questions).groups)
                for (const placedRow of placed) {
                    const tabDef = TABS.find((candidate) =>
                        candidate.groups.some((group) => group.bucket === placedRow.bucket)
                    )
                    if (tabDef) setTabId(tabDef.id)
                    await insertRow(placedRow.row, placedRow.bucket, Number.MAX_SAFE_INTEGER)
                }
                setNotice(`Đã thêm ${placed.length} câu — tự lưu sau thao tác.`)
                if (skipped.length > 0) {
                    setFlash(`${skipped.length} câu bỏ qua vì chưa gán nhóm.`)
                }
            } catch (error) {
                setFlash(messageOf(error))
            } finally {
                clearParam()
            }
        })()
        // One-shot by design: addStartedRef makes every later run a no-op.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingAdd])

    const handleReorder = (bucket: string, from: number, to: number) => {
        setDraft((current) =>
            current
                ? { ...current, [bucket]: arrayMove(current[bucket] ?? [], from, to) }
                : current
        )
    }

    const handleRemove = (bucket: string, rowId: string) => {
        setDraft((current) => {
            if (!current) return current
            const entries = current[bucket] ?? []
            const seen = new Map<string, number>()
            let index = -1
            for (let i = 0; i < entries.length; i += 1) {
                const nth = (seen.get(entries[i].sourceId) ?? 0) + 1
                seen.set(entries[i].sourceId, nth)
                if (`${entries[i].sourceId}~${nth}` === rowId) {
                    index = i
                    break
                }
            }
            if (index < 0) return current

            const removed = entries[index]
            const next =
                removed.kind === "KEYWORD"
                    ? entries.filter((entry) => entry.kind !== "HINT")
                    : entries.filter((_, i) => i !== index)
            return { ...current, [bucket]: next }
        })
    }

    const buildPatchEntries = (): Array<Omit<Entry, "questionText" | "kind" | "badge" | "position"> & { position?: number }> => {
        const source = draft ?? original.groups
        const grouped = flatten(source).map((entry) => ({
            roundId: entry.roundId,
            turnId: entry.turnId,
            sourceId: entry.sourceId,
            ...(entry.points !== undefined ? { points: entry.points } : {}),
        }))
        const rest = original.unplaced.map((entry) => ({
            roundId: entry.roundId,
            turnId: entry.turnId,
            sourceId: entry.sourceId,
            ...(entry.points !== undefined ? { points: entry.points } : {}),
            ...(entry.position !== undefined ? { position: entry.position } : {}),
        }))
        return [...grouped, ...rest]
    }

    const currentFlat = flatten(shown)
    const originalFlat = flatten(original.groups)
    const changes = diffCount(currentFlat, originalFlat)
    const duplicateInGroup = ALL_GROUPS.some((group) => {
        const entries = shown[group.bucket] ?? []
        return new Set(entries.map((entry) => entry.sourceId)).size !== entries.length
    })
    // set only by "Xong" — an autosave writes without closing the editor
    const closeAfterSaveRef = useRef(false)

    const save =
        useMutation({
            mutationFn: () =>
                api<{ assemblyRevision: number }>(
                    `/portal/tournaments/${tournamentId}/matches/${match.id}/assemble`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            questions: buildPatchEntries(),
                            baseRevision: match.assemblyRevision ?? 0,
                        }),
                    }
                ),
            onSuccess: (result) => {
                if (closeAfterSaveRef.current) {
                    closeAfterSaveRef.current = false
                    setDraft(null)
                }
                setSaveError(null)
                setConflict(null)
                setNotice(`Đã lưu — revision ${result.assemblyRevision}.`)
                void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
                void queryClient.invalidateQueries({
                    queryKey: ["match-detail", tournamentId, match.id],
                })
            },
            onError: (error) => {
                closeAfterSaveRef.current = false
                if (error instanceof ApiError && error.code === "CONFLICT") {
                    setConflict(error.message)
                    void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
                    return
                }
                setSaveError(messageOf(error))
            },
        })

    const saveReason = duplicateInGroup
        ? "Trùng một câu trong cùng nhóm — gỡ trước khi lưu."
        : changes === 0
          ? "Chưa có thay đổi."
          : null


    // Autosave: a hand that stops for 750 ms has finished its thought, so the
    // change goes up by itself. Conflicts pause it — an overwrite is a human
    // decision (the banner below asks for it), never a timer's.
    const saveRef = useRef(save)
    useEffect(() => {
        saveRef.current = save
    }, [save])

    const pendingWork = draft !== null && changes > 0 && saveReason === null && !conflict

    useEffect(() => {
        if (!pendingWork || save.isPending) return
        const timer = setTimeout(() => saveRef.current.mutate(), 750)
        return () => clearTimeout(timer)
    }, [pendingWork, save.isPending, changes])

    const leaveCompose = () => {
        // autosave means "Xong" flushes the last stopped-hand change; the
        // editor only closes when there is nothing left to write
        if (draft !== null && changes > 0 && saveReason === null && !conflict) {
            closeAfterSaveRef.current = true
            save.mutate()
            return
        }
        if (conflict) return // the banner decides whether to overwrite
        setDraft(null)
        setFlash(null)
        setSaveError(null)
        setConflict(null)
    }

    const groupPanes = (
        <div className="grid gap-4">
            {tab.groups.map((group) => {
                const entries = shown[group.bucket] ?? []
                const required = requiredFor(group, rules, match.players.length)
                const filled =
                    group.bucket === "giai-ma"
                        ? entries.filter((entry) => entry.kind === "HINT").length
                        : entries.length
                return (
                    <ComposeGroup
                        key={group.bucket}
                        groupId={group.bucket}
                        label={group.label}
                        {...(group.typeLabel ? { typeLabel: group.typeLabel } : {})}
                        filled={filled}
                        required={required}
                        rows={toComposeRows(entries)}
                        editable={editable}
                        onRemove={(rowId) => handleRemove(group.bucket, rowId)}
                        emptyHint={
                            editable
                                ? "Kéo câu từ ngân hàng bên phải, hoặc bấm vào một câu để thêm"
                                : "Chưa có câu hỏi trong nhóm này"
                        }
                    />
                )
            })}

            {original.unplaced.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {original.unplaced.length} câu không khớp vòng nào của bộ AOC
                    </span>
                    <ul className="mt-1 list-inside list-disc text-muted-foreground">
                        {original.unplaced.map((entry, index) => (
                            <li key={`${entry.sourceId}~${index}`}>
                                {entry.questionText || entry.sourceId}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )

    const pickerPane = editable && (
        <aside className="grid content-start gap-3 rounded-lg border bg-card p-3">
            <div className="grid gap-2">
                <span className="text-sm font-semibold">Ngân hàng · {tab.label}</span>
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="tìm câu hỏi…"
                    className="h-8"
                    aria-label="Tìm trong ngân hàng"
                />
                <span className="text-xs text-muted-foreground">
                    {eligible.isPending
                        ? "Đang tải…"
                        : `${eligible.data?.total ?? pickerRows.length} câu PUBLISHED${(eligible.data?.total ?? 0) > 200 ? " (trang đầu)" : ""}`}
                </span>
            </div>
            <ul className="grid max-h-[26rem] gap-1 overflow-y-auto">
                {pickerRows.map((row) => (
                    <BankPickerItem
                        key={row.id}
                        sourceId={row.id}
                        primary={row.questionText}
                        typeBadge={badgeOfRow(row)}
                        {...(bucketOfRow(row) ? { secondary: bucketOfRow(row) as string } : {})}
                        onClick={() => {
                            const target =
                                bucketOfRow(row) && tab.groups.some((g) => g.bucket === bucketOfRow(row))
                                    ? (bucketOfRow(row) as string)
                                    : tab.groups[0]?.bucket
                            if (target) handleAdd(row.id, target, (shown[target] ?? []).length)
                        }}
                    />
                ))}
                {eligible.isError && (
                    <li className="text-xs text-destructive">{messageOf(eligible.error)}</li>
                )}
                {pickerRows.length === 0 && !eligible.isPending && !eligible.isError && (
                    <li className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                        Không có câu phù hợp nhóm này.
                    </li>
                )}
            </ul>
        </aside>
    )

    return (
        <ComposeDndProvider onAdd={handleAdd} onReorder={handleReorder}>
            <section aria-label="Câu hỏi của trận" className="grid gap-4 rounded-xl border bg-card p-4">
                <header className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">Câu hỏi của trận</h2>
                    <Badge variant="outline">{match.questions.length} câu · đóng băng</Badge>
                    {lastEvent && (
                        <span className="text-xs text-muted-foreground">
                            sửa gần nhất: rev {lastEvent.revision} · +{lastEvent.addedCount} −
                            {lastEvent.removedCount}
                        </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        {editable ? (
                            <>
                                <span aria-live="polite" className="text-xs text-muted-foreground">
                                    {save.isPending
                                        ? "Đang tự lưu…"
                                        : conflict
                                          ? "Bản nháp chờ bạn ghi đè"
                                          : changes === 0
                                            ? "✓ đã đồng bộ"
                                            : saveReason ?? "Đang chờ tự lưu…"}
                                </span>
                                <Button variant="ghost" size="sm" onClick={leaveCompose} disabled={save.isPending}>
                                    <X className="size-4" /> Xong
                                </Button>
                            </>
                        ) : match.status === "UPCOMING" ? (
                            <>
                                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                                    <Upload className="size-3.5" /> Nhập Excel
                                </Button>
                                <Button variant="outline" size="sm" onClick={enterCompose}>
                                    <Pencil className="size-3.5" /> Sửa câu hỏi
                                </Button>
                            </>
                        ) : (
                            <span className="text-xs text-muted-foreground">
                                Chỉ sửa được khi trận còn UPCOMING
                            </span>
                        )}
                    </div>
                </header>

                {conflict && (
                    <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <RefreshCw className="size-3.5 shrink-0" />
                        {conflict} Trận vừa được lưu ở nơi khác — bấm Lưu sẽ ghi đè bản mới, nên
                        soi lại danh sách trước.
                        <Button variant="outline" size="sm" onClick={() => save.mutate()}>
                            Vẫn lưu
                        </Button>
                    </p>
                )}
                {saveError && (
                    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {saveError}
                    </p>
                )}
                {flash && (
                    <p className="rounded-lg border px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        {flash}
                    </p>
                )}
                {notice && (
                    <p className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-xs">
                        ✓ {notice}
                    </p>
                )}

                {importOpen && match.status === "UPCOMING" && (
                    <ExcelImportDialog
                        open
                        onClose={() => setImportOpen(false)}
                        commitTo={{
                            tournamentId,
                            matchId: match.id,
                            onDone: (created, revision) => {
                                setNotice(
                                    `Đã nhập ${created} câu vào trận${revision !== null ? ` · rev ${revision}` : ""}.`
                                )
                            },
                        }}
                    />
                )}

                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vòng thi">
                    {TABS.map((candidate) => {
                        const active = candidate.id === tabId
                        const count = candidate.groups.reduce(
                            (sum, group) => sum + (shown[group.bucket]?.length ?? 0),
                            0
                        )
                        return (
                            <button
                                key={candidate.id}
                                type="button"
                                role="tab"
                                aria-pressed={active}
                                onClick={() => setTabId(candidate.id)}
                                className={
                                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
                                    (active
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "bg-background hover:bg-muted")
                                }
                            >
                                {candidate.label}
                                <span className="ml-1.5 text-xs font-normal opacity-70">{count}</span>
                            </button>
                        )
                    })}
                </div>

                <div className={editable ? "grid gap-4 lg:grid-cols-[1fr_22rem]" : "grid gap-4"}>
                    {groupPanes}
                    {pickerPane}
                </div>
            </section>
        </ComposeDndProvider>
    )
}

export default MatchQuestionSurface
