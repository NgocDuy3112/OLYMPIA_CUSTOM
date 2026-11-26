import { useEffect, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, FileText, Globe, ListPlus, Plus, Search, X } from "lucide-react"
import { cn } from "cn"
import { api } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import { EmptyState, ErrorPanel, ListSkeleton, Page, PageHeader } from "@/components/page"
import { useMe } from "@/lib/session"
import { AddToMatchDialog } from "./questions/AddToMatchDialog"
import { ArchiveConfirmDialog } from "./questions/ArchiveConfirmDialog"
import { GroupList } from "./questions/GroupList"
import { InspectorDrawer } from "./questions/InspectorDrawer"
import { Pagination } from "./questions/Pagination"
import { QuestionDialog } from "./questions/QuestionDialog"
import {
    BUCKET_TAGS,
    STATUS_LABEL,
    TABS,
    TRANSITIONS,
    activeTab,
    bucketOf,
    groupLabelOf,
    listParams,
    messageOf,
    readUrlState,
} from "./questions/model"
import type { BankQuestion, Paged, Status, UrlState } from "./questions/model"

export function QuestionsPage() {
    const queryClient = useQueryClient()
    const { data: me } = useMe()

    const [state, setState] = useState<UrlState>(() => readUrlState())
    const [searchInput, setSearchInput] = useState(() => state.search)

    const update = (patch: Partial<UrlState>) =>
        setState((current) => {
            const next = { ...current, ...patch }
            if (!("page" in patch)) next.page = 1
            return next
        })

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
        if (state.page > 1) params.set("page", String(state.page))
        const query = params.toString()
        let searchPart = ""
        if (query) searchPart = `?${query}`
        window.history.replaceState(
            null,
            "",
            window.location.pathname + searchPart + window.location.hash
        )
    }, [state])

    const list = useQuery({
        queryKey: ["questions", listParams(state).toString()],
        queryFn: () => api<Paged>(`/portal/questions?${listParams(state).toString()}`),
        placeholderData: keepPreviousData,
    })

    const countFilters = JSON.stringify({ status: state.status, search: state.search })
    const counts = useQuery({
        queryKey: ["bucket-counts", countFilters],
        queryFn: () => {
            const params = new URLSearchParams()
            if (state.status !== "ALL") params.set("status", state.status)
            if (state.search) params.set("search", state.search)
            const qs = params.toString()
            let qsSuffix = ""
            if (qs) qsSuffix = `?${qs}`
            return api<Record<string, number>>(`/portal/questions/bucket-counts${qsSuffix}`)
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

    const archive = useMutation({
        mutationFn: (id: string) =>
            api<void>(`/portal/questions/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            setFlash(null)
            setConfirming(null)
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
        },
        onError: (cause, id) => setFlash({ id, message: messageOf(cause) }),
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
            let emptyFlash = "Không có gì để làm."
            if (skipped > 0) emptyFlash = `Không có câu nào đủ điều kiện (${skipped} bị bỏ qua).`
            setBulkFlash(emptyFlash)
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
            let bulkResult = `${what}: ${done} câu đã xử lý.`
            if (firstError) bulkResult = `${what}: ${done}/${results.length} thành công — lỗi đầu: ${messageOf(firstError.reason)}`
            setBulkFlash(bulkResult)
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

    let confirmError: string | null = null
    if (confirming && archive.isError) confirmError = messageOf(archive.error)

    return (
        <Page>
            <PageHeader
                title="Questions"
                actions={
                    <div className="flex items-center gap-2">
                        <Button aria-label="New question" title="New question" onClick={() => setEditing({ open: true, row: null })}>
                            <Plus className="size-4" aria-hidden />
                        </Button>
                    </div>
                }
            />


            {
}
            {selected.size > 0 && (
                <div className="sticky top-0 z-40 border-b bg-card/95 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">{selected.size} đã chọn</span>
                        <span className="text-xs text-muted-foreground">
                            ở{" "}
                            {[...new Set(
                                [...selected.values()].map(
                                    (row) => groupLabelOf(bucketOf(row)) ?? "chưa gán"
                                )
                            )].join(", ")}
                        </span>
                        <Button
                            className="ml-auto"
                            size="sm"
                            variant="outline"
                            aria-label="Đăng"
                            title="Đăng"
                            disabled={bulkBusy || !isAdmin}
                            onClick={() => bulkStatus("PUBLISHED")}
                        >
                            <Globe className="size-4" aria-hidden />
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            aria-label="Nhân bản"
                            title="Nhân bản"
                            disabled={bulkBusy}
                            onClick={bulkDuplicate}
                        >
                            <Copy className="size-4" aria-hidden />
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
                            aria-label="Thêm vào trận"
                            title="Thêm vào trận"
                            disabled={bulkBusy}
                            onClick={() => setAddRows([...selected.values()])}
                        >
                            <ListPlus className="size-4" aria-hidden />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Bỏ chọn"
                            title="Bỏ chọn"
                            disabled={bulkBusy}
                            onClick={clearSelection}
                        >
                            <X className="size-4" aria-hidden />
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
                    <Button type="submit" variant="outline" size="sm" className="h-8" aria-label="Search" title="Search">
                        <Search className="size-4" aria-hidden />
                    </Button>
                </form>

                {TABS.map((tab) => {
                    const active = state.tab === tab.id
                    const count = tab.groups.reduce(
                        (sum, group) => sum + (counts.data?.[group.bucket ?? ""] ?? 0),
                        0
                    )
                    let tabCls = "bg-background hover:bg-muted"
                    if (active) tabCls = "border-primary bg-primary text-primary-foreground"
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => update({ tab: tab.id })}
                            className={cn(
                                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                                tabCls
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

            {list.data && (
                <Pagination
                    total={list.data.total}
                    page={state.page}
                    busy={list.isFetching}
                    onChange={(page) => update({ page })}
                />
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
                error={confirmError}
                pending={archive.isPending}
                onCancel={() => setConfirming(null)}
                onConfirm={() => {
                    if (confirming) archive.mutate(confirming.id)
                }}
            />


            {addRows !== null && (
                <AddToMatchDialog rows={addRows} onClose={() => setAddRows(null)} />
            )}
        </Page>
    )
}
