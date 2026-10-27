import { useState } from "react"
import { Link } from "react-router-dom"
import { CalendarDays, SearchX } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
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
import { SEASONS_PAGE_SIZE, useTournaments } from "@/lib/tournaments"
import { useDebouncedValue } from "@/lib/use-debounced-value"
import { NewTournamentDialog } from "@/components/new-tournament-dialog"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })


// The tournaments of the portal. A tournament is the unit: its roster, its stages, its matches
// and its standings.
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
    const first = total === 0 ? 0 : offset + 1
    const last = Math.min(offset + SEASONS_PAGE_SIZE, total)
    const canGoBack = offset > 0
    const canGoForward = offset + SEASONS_PAGE_SIZE < total

    return (
        <Page>
            <PageHeader
                title="Tournaments"
                description={data ? `${total} tournament${total === 1 ? "" : "s"}` : undefined}
                actions={
                    <Button size="sm" onClick={() => setCreating(true)}>
                        New tournament
                    </Button>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">All tournaments</CardTitle>
                    <CardDescription>
                        One run of a show: its roster, its stages, its matches and its standings.
                    </CardDescription>
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

                <CardContent className="p-0 [&_th:first-child]:pl-(--card-spacing) [&_td:first-child]:pl-(--card-spacing) [&_th:last-child]:pr-(--card-spacing) [&_td:last-child]:pr-(--card-spacing)]">
                    {isPending ? (
                        <ListSkeleton rows={3} />
                    ) : isError ? (
                        <ErrorPanel message={error instanceof Error ? error.message : "Could not load the tournaments."} />
                    ) : items.length === 0 ? (
                        <EmptyState
                            icon={searchInput ? SearchX : CalendarDays}
                            title={searchInput ? "No tournament matches that search" : "No tournaments yet"}
                            description={
                                searchInput
                                    ? "Try a different name."
                                    : "Create the first tournament to start a run."
                            }
                        />
                    ) : (
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
                                                className="underline-offset-2 hover:underline"
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
                    )}
                </CardContent>

                <CardFooter className="justify-between gap-4 border-t">
                    <p className="text-sm text-muted-foreground">
                        {total === 0 ? "Nothing yet" : `${first}–${last} of ${total}`}
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
