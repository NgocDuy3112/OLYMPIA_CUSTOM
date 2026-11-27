import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { CalendarDays, Plus, SearchX } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Card,
    CardAction,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@shared/ui/card"
import { Input } from "@shared/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shared/ui/table"

import { EmptyState, ErrorPanel, ListSkeleton, Page, PageHeader } from "@/components/page"
import { cardTable } from "./table-frame"
import { SEASONS_PAGE_SIZE, useTournaments } from "@/lib/tournaments"
import { useDebouncedValue } from "@/lib/use-debounced-value"
import { NewTournamentDialog } from "@/components/new-tournament-dialog"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })


export function TournamentsPage() {
    const [searchInput, setSearchInput] = useState("")
    const [offset, setOffset] = useState(0)
    const [creating, setCreating] = useState(false)

    const search = useDebouncedValue(searchInput)

    const { data, error, isPending, isError, isFetching } = useTournaments({
        search,
        limit: SEASONS_PAGE_SIZE,
        offset,
    })

    const total = data?.total ?? 0
    const items = data?.items ?? []
    let first = offset + 1
    if (total === 0) first = 0
    const last = Math.min(offset + SEASONS_PAGE_SIZE, total)
    const canGoBack = offset > 0
    const canGoForward = offset + SEASONS_PAGE_SIZE < total

    let rangeText = `${first}–${last} of ${total}`
    if (total === 0) rangeText = "Nothing yet"
    let emptyIcon = CalendarDays
    if (searchInput) emptyIcon = SearchX
    let emptyTitle = "No tournaments yet"
    if (searchInput) emptyTitle = "No tournament matches that search"
    let emptyDescription = "Create the first tournament to start a run."
    if (searchInput) emptyDescription = "Try a different name."
    let errorMessage = "Could not load the tournaments."
    if (error instanceof Error) errorMessage = error.message

    let listSlot: ReactNode = (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Stages</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((tournament) => (
                    <TableRow key={tournament.id}>
                        <TableCell className="font-medium">
                            <Link
                                className="rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                                to={`/tournaments/${tournament.id}`}
                            >
                                {tournament.name}
                            </Link>
                        </TableCell>
                        <TableCell>{tournament.stages.length}</TableCell>
                        <TableCell className="text-muted-foreground">
                            {dateFormat.format(new Date(tournament.createdAt))}
                        </TableCell>
                        <TableCell className="flex gap-2">
                            {tournament.current && <Badge>Current</Badge>}
                            {tournament.closedAt && (
                                <Badge variant="secondary">Closed</Badge>
                            )}
                            {tournament.visibility === "PRIVATE" && (
                                <Badge variant="outline">Private</Badge>
                            )}
                            {!tournament.current &&
                                !tournament.closedAt &&
                                tournament.visibility !== "PRIVATE" && (
                                    <span className="text-muted-foreground">—</span>
                                )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
    if (items.length === 0) {
        listSlot = (
            <EmptyState
                icon={emptyIcon}
                title={emptyTitle}
                description={emptyDescription}
            />
        )
    }
    if (isError) {
        listSlot = <ErrorPanel message={errorMessage} />
    }
    if (isPending) {
        listSlot = <ListSkeleton rows={3} />
    }

    return (
        <Page>
            <PageHeader
                title="Tournaments"
                description="One run of a show — its roster, stages, matches and standings."
                actions={
                    <Button size="sm" onClick={() => setCreating(true)}>
                        <Plus className="size-4" aria-hidden /> New tournament
                    </Button>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">All tournaments</CardTitle>
                    <CardAction>
                        <Input
                            className="w-full sm:w-64"
                            placeholder="Search…"
                            value={searchInput}
                            onChange={(event) => {
                                setSearchInput(event.target.value)
                                setOffset(0)
                            }}
                        />
                    </CardAction>
                </CardHeader>

                <CardContent className={cardTable}>
                    {listSlot}
                </CardContent>

                <CardFooter className="justify-between gap-4 border-t">
                    <p className="text-sm text-muted-foreground">
                        {rangeText}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!canGoBack || isFetching}
                            onClick={() => setOffset(Math.max(0, offset - SEASONS_PAGE_SIZE))}
                        >
                            Previous
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!canGoForward || isFetching}
                            onClick={() => setOffset(offset + SEASONS_PAGE_SIZE)}
                        >
                            Next
                        </Button>
                    </div>
                </CardFooter>
            </Card>

            {creating && (
                <NewTournamentDialog open onOpenChange={(open) => { if (!open) setCreating(false) }} />
            )}
        </Page>
    )
}
