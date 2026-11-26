import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight, Copy, Download, ScrollText, SearchX } from "lucide-react"
import { auditExportUrl, useAuditEvents, useAuditEventsActions, useAuditStream } from "@shared/http/audit"
import { errorMessage } from "@shared/lib/error-text"
import type { StreamStatus } from "@shared/lib/ws"
import { Badge } from "@shared/ui/badge"
import { Button, buttonVariants } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import type { AuditEventRow, AuditFilterParams } from "@shared/wire/audit"
import { EmptyState, ErrorPanel, ListSkeleton, Page, PageHeader } from "@/components/page"
import { useDebouncedValue } from "@/lib/use-debounced-value"

const PAGE_SIZE = 50
const DETAILS_PRE_CLASS = "max-h-64 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs"

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
})

function streamLabel(status: StreamStatus): string {
    if (status === "live") return "Live"
    if (status === "reconnecting" || status === "connecting") return "Reconnecting"
    return "Paused"
}

function shortId(id: string | null): string {
    if (!id) return "—"
    return id.slice(0, 8)
}

function dayStart(date: string): string {
    return new Date(`${date}T00:00:00Z`).toISOString()
}

function dayEnd(date: string): string {
    return new Date(`${date}T23:59:59.999Z`).toISOString()
}

export function AuditPage() {
    const [searchInput, setSearchInput] = useState("")
    const [action, setAction] = useState("")
    const [from, setFrom] = useState("")
    const [to, setTo] = useState("")
    const [offset, setOffset] = useState(0)
    const [expandedIds, setExpandedIds] = useState<string[]>([])
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const search = useDebouncedValue(searchInput)

    const filters: AuditFilterParams = {}
    if (search) filters.q = search
    if (action) filters.action = action
    if (from) filters.from = dayStart(from)
    if (to) filters.to = dayEnd(to)

    const listParams = { ...filters, limit: PAGE_SIZE, offset }
    const streamStatus = useAuditStream(listParams)
    const list = useAuditEvents(listParams, streamStatus)
    const actions = useAuditEventsActions()

    const items = list.data?.items ?? []
    const total = list.data?.total ?? 0
    const canGoBack = offset > 0
    const canGoForward = offset + PAGE_SIZE < total
    const filtering = Object.keys(filters).length > 0

    let first = offset + 1
    if (total === 0) first = 0
    const rangeText = `${first}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`

    const toggleRow = (id: string) => {
        setExpandedIds((current) => {
            if (current.includes(id)) return current.filter((rowId) => rowId !== id)
            return [...current, id]
        })
    }

    const copyDetails = (row: AuditEventRow) => {
        void navigator.clipboard.writeText(JSON.stringify(row.details, null, 2))
        setCopiedId(row.id)
        window.setTimeout(() => {
            setCopiedId((current) => (current === row.id ? null : current))
        }, 1_500)
    }

    let listSlot = (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-44">When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="w-24">Match</TableHead>
                    <TableHead className="w-32">IP</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((row) => {
                    const open = expandedIds.includes(row.id)
                    return (
                        <Fragment key={row.id}>
                            <TableRow>
                                <TableCell>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-expanded={open}
                                        aria-label={open ? "Collapse event" : "Expand event"}
                                        onClick={() => toggleRow(row.id)}
                                    >
                                        {open ? (
                                            <ChevronDown className="size-3.5" aria-hidden />
                                        ) : (
                                            <ChevronRight className="size-3.5" aria-hidden />
                                        )}
                                    </Button>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {dateTimeFormat.format(new Date(row.createdAt))}
                                </TableCell>
                                <TableCell className="font-mono text-sm">{row.action}</TableCell>
                                <TableCell className="text-sm">{row.actorName ?? "—"}</TableCell>
                                <TableCell className="text-sm">{row.targetName ?? "—"}</TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                    {shortId(row.matchId)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                    {row.ip ?? "—"}
                                </TableCell>
                            </TableRow>
                            {open && (
                                <TableRow>
                                    <TableCell />
                                    <TableCell colSpan={6} className="whitespace-normal">
                                        <div className="grid gap-3 py-2">
                                            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                                                <div className="flex gap-2">
                                                    <dt className="text-muted-foreground">ip</dt>
                                                    <dd className="font-mono">{row.ip ?? "—"}</dd>
                                                </div>
                                                <div className="flex gap-2">
                                                    <dt className="text-muted-foreground">actorId</dt>
                                                    <dd className="font-mono">{row.actorId ?? "—"}</dd>
                                                </div>
                                                <div className="flex gap-2">
                                                    <dt className="text-muted-foreground">targetId</dt>
                                                    <dd className="font-mono">{row.targetId ?? "—"}</dd>
                                                </div>
                                                <div className="flex gap-2">
                                                    <dt className="text-muted-foreground">matchId</dt>
                                                    <dd className="font-mono">{row.matchId ?? "—"}</dd>
                                                </div>
                                                <div className="col-span-2 flex gap-2 sm:col-span-1">
                                                    <dt className="text-muted-foreground">userAgent</dt>
                                                    <dd className="min-w-0 truncate">{row.userAgent ?? "—"}</dd>
                                                </div>
                                            </dl>
                                            <div className="grid gap-2">
                                                <pre className={DETAILS_PRE_CLASS}>
                                                    {JSON.stringify(row.details, null, 2)}
                                                </pre>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-fit"
                                                    onClick={() => copyDetails(row)}
                                                >
                                                    <Copy className="size-3.5" aria-hidden />
                                                    {copiedId === row.id ? "Copied" : "Copy JSON"}
                                                </Button>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </Fragment>
                    )
                })}
            </TableBody>
        </Table>
    )
    if (items.length === 0) {
        let emptyTitle = "No audit events yet"
        let emptyDescription = "Actions taken in the portal will show up here."
        if (filtering) {
            emptyTitle = "No audit event matches these filters"
            emptyDescription = "Try a different search or clear the filters."
        }
        listSlot = (
            <EmptyState
                icon={filtering ? SearchX : ScrollText}
                title={emptyTitle}
                description={emptyDescription}
            />
        )
    }
    if (list.isError) {
        listSlot = <ErrorPanel message={errorMessage(list.error)} />
    }
    if (list.isPending) {
        listSlot = <ListSkeleton />
    }

    return (
        <Page>
            <PageHeader
                title="Audit log"
                actions={
                    <>
                        <Badge variant={streamStatus === "live" ? "default" : "outline"}>
                            {streamLabel(streamStatus)}
                        </Badge>
                        <a
                            className={buttonVariants({ variant: "outline" })}
                            href={auditExportUrl(filters)}
                            download
                        >
                            <Download className="size-4" aria-hidden /> Export CSV
                        </a>
                    </>
                }
            />

            <div className="flex flex-wrap items-end gap-2">
                <Input
                    className="w-full sm:w-64"
                    placeholder="Search…"
                    aria-label="Search audit events"
                    value={searchInput}
                    onChange={(event) => {
                        setSearchInput(event.target.value)
                        setOffset(0)
                    }}
                />
                <select
                    aria-label="Action"
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    value={action}
                    onChange={(event) => {
                        setAction(event.target.value)
                        setOffset(0)
                    }}
                >
                    <option value="">All actions</option>
                    {actions.data?.actions.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
                <Input
                    className="w-40"
                    type="date"
                    aria-label="From"
                    value={from}
                    onChange={(event) => {
                        setFrom(event.target.value)
                        setOffset(0)
                    }}
                />
                <Input
                    className="w-40"
                    type="date"
                    aria-label="To"
                    value={to}
                    onChange={(event) => {
                        setTo(event.target.value)
                        setOffset(0)
                    }}
                />
                <Button
                    variant="outline"
                    disabled={!filtering && searchInput.length === 0}
                    onClick={() => {
                        setSearchInput("")
                        setAction("")
                        setFrom("")
                        setTo("")
                        setOffset(0)
                    }}
                >
                    Clear filters
                </Button>
                <span className="ml-auto text-sm text-muted-foreground">{rangeText}</span>
            </div>

            <div className="rounded-xl border bg-card">
                {listSlot}
                <div className="flex justify-end gap-2 border-t p-3">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!canGoBack || list.isFetching}
                        onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                        Previous
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!canGoForward || list.isFetching}
                        onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </Page>
    )
}
