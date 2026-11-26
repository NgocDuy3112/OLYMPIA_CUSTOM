import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { arrayMove } from "@dnd-kit/sortable"
import { ApiError, api, type PageResult } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { ComposeDndProvider } from "@/components/compose-group"
import { MatchDirectImportDialog } from "@/components/match-direct-import-dialog"
import { useTournament, type MatchDetail, type MatchSummary } from "@/lib/tournament"
import { BankPickerPane } from "./match-question/bank-picker-pane"
import { GroupPanes } from "./match-question/group-panes"
import { HeaderActions } from "./match-question/header-actions"
import { MatchTabsBar } from "./match-question/tabs-bar"
import { StatusBanners } from "./match-question/status-banners"
import {
    ALL_GROUPS,
    BUCKET_TAGS,
    TABS,
    badgeOfRow,
    bucketOfRow,
    bucketize,
    diffCount,
    flatten,
    messageOf,
    spliceInto,
    type BankRow,
    type Entry,
    type FrozenQuestion,
} from "./match-question/model"

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
    const [pendingAdd] = useState<string | null>(() => {
        if (typeof window === "undefined") return null
        return new URLSearchParams(window.location.search).get("add")
    })
    const addStartedRef = useRef(false)

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(search.trim()), 300)
        return () => clearTimeout(timer)
    }, [search])

    const detail = useQuery({
        queryKey: ["match-detail", tournamentId, match.id],
        queryFn: () =>
            api<MatchDetail>(`/portal/tournaments/${tournamentId}/matches/${match.id}`),
        staleTime: 15_000,
    })
    const lastEvent = detail.data?.assemblyEvents?.[0]

    const editable = draft !== null
    const shown = draft ?? original.groups
    const tab = TABS.find((candidate) => candidate.id === tabId) ?? TABS[0]
    const rules = tournament?.roundRules

    let pickerKind = "TEXT"
    if (tab.id === "giai-ma") pickerKind = "KEYWORD"
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
                keywordId: row.keywordId ?? null,
                badge: badgeOfRow(row),
            }
            if (group.points !== undefined) base.points = group.points

            let entries: Entry[] = [base]
            if (targetBucket === "giai-ma" && row.kind === "KEYWORD") {
                const hints = await api<PageResult<BankRow>>(
                    `/portal/questions?${new URLSearchParams({
                        kind: "TEXT",
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
                        kind: "TEXT",
                        keywordId: hint.keywordId ?? row.id,
                        badge: "Gợi ý",
                    })),
                ]
            }

            setDraft((current) => {
                if (!current) return current
                return {
                    ...current,
                    [targetBucket]: spliceInto(current[targetBucket] ?? [], index, entries),
                }
            })
        },
        [setDraft]
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
                    let skipFlash = "Không tìm thấy câu cần thêm."
                    if (skipped.length > 0) skipFlash = "Câu chưa gán nhóm — gán nhóm trước khi thêm vào trận."
                    setFlash(skipFlash)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingAdd])

    const handleReorder = (bucket: string, from: number, to: number) => {
        setDraft((current) => {
            if (!current) return current
            return { ...current, [bucket]: arrayMove(current[bucket] ?? [], from, to) }
        })
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
            let next = entries.filter((_, i) => i !== index)
            if (removed.kind === "KEYWORD") next = entries.filter((entry) => entry.kind !== "TEXT")
            return { ...current, [bucket]: next }
        })
    }

    const buildPatchEntries = (): Array<Omit<Entry, "questionText" | "kind" | "badge" | "position"> & { position?: number }> => {
        const source = draft ?? original.groups
        const grouped = flatten(source).map((entry) => {
            const item: { roundId: string; turnId: string; sourceId: string; points?: number } = {
                roundId: entry.roundId,
                turnId: entry.turnId,
                sourceId: entry.sourceId,
            }
            if (entry.points !== undefined) item.points = entry.points
            return item
        })
        const rest = original.unplaced.map((entry) => {
            const item: { roundId: string; turnId: string; sourceId: string; points?: number; position?: number } = {
                roundId: entry.roundId,
                turnId: entry.turnId,
                sourceId: entry.sourceId,
            }
            if (entry.points !== undefined) item.points = entry.points
            if (entry.position !== undefined) item.position = entry.position
            return item
        })
        return [...grouped, ...rest]
    }

    const currentFlat = flatten(shown)
    const originalFlat = flatten(original.groups)
    const changes = diffCount(currentFlat, originalFlat)
    const duplicateInGroup = ALL_GROUPS.some((group) => {
        const entries = shown[group.bucket] ?? []
        return new Set(entries.map((entry) => entry.sourceId)).size !== entries.length
    })
    const closeAfterSaveRef = useRef(false)

    const save =
        useMutation({
            mutationFn: () => {
                if (detail.data === undefined) {
                    throw new Error("Đang tải revision hiện tại của trận.")
                }
                return api<{ assemblyRevision: number }>(
                    `/portal/tournaments/${tournamentId}/matches/${match.id}/assemble`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            questions: buildPatchEntries(),
                            baseRevision: detail.data.assemblyRevision,
                        }),
                    }
                )
            },
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

    let saveReason: string | null = null
    if (detail.data === undefined) saveReason = "Đang tải revision hiện tại của trận."
    if (changes === 0) saveReason = "Chưa có thay đổi."
    if (duplicateInGroup) saveReason = "Trùng một câu trong cùng nhóm — gỡ trước khi lưu."


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
        if (draft !== null && changes > 0 && saveReason === null && !conflict) {
            closeAfterSaveRef.current = true
            save.mutate()
            return
        }
        if (conflict) return
        setDraft(null)
        setFlash(null)
        setSaveError(null)
        setConflict(null)
    }

    let statusText = saveReason ?? "Đang chờ tự lưu…"
    if (changes === 0) statusText = "✓ đã đồng bộ"
    if (conflict) statusText = "Bản nháp chờ bạn ghi đè"
    if (save.isPending) statusText = "Đang tự lưu…"

    let boardCls = "grid gap-4"
    if (editable) boardCls = "grid gap-4 lg:grid-cols-[1fr_22rem]"

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
                    <HeaderActions
                        matchStatus={match.status}
                        editable={editable}
                        statusText={statusText}
                        savePending={save.isPending}
                        onEnterCompose={enterCompose}
                        onLeaveCompose={leaveCompose}
                        onOpenImport={() => setImportOpen(true)}
                    />
                </header>

                <StatusBanners
                    conflict={conflict}
                    saveError={saveError}
                    flash={flash}
                    notice={notice}
                    onSave={() => save.mutate()}
                />

                {importOpen && match.status === "UPCOMING" ? (
                    <MatchDirectImportDialog
                        open
                        onClose={() => setImportOpen(false)}
                        tournamentId={tournamentId}
                        matchId={match.id}
                        onDone={(created, revision) => {
                            setNotice(`Đã nhập ${created} câu vào trận · rev ${revision}.`)
                        }}
                    />
                ) : null}

                <MatchTabsBar tabId={tabId} shown={shown} onSelect={setTabId} />

                <div className={boardCls}>
                    <GroupPanes
                        tab={tab}
                        shown={shown}
                        unplaced={original.unplaced}
                        editable={editable}
                        rules={rules}
                        playerCount={match.players.length}
                        onRemove={handleRemove}
                    />
                    {editable && (
                        <BankPickerPane
                            tab={tab}
                            search={search}
                            onSearchChange={setSearch}
                            pickerRows={pickerRows}
                            total={eligible.data?.total}
                            isPending={eligible.isPending}
                            isError={eligible.isError}
                            error={eligible.isError ? eligible.error : null}
                            shown={shown}
                            onAdd={handleAdd}
                        />
                    )}
                </div>
            </section>
        </ComposeDndProvider>
    )
}

export default MatchQuestionSurface
