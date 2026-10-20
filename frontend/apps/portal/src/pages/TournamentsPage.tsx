import { useState } from "react"
import { Link } from "react-router-dom"
import { SearchX, Trophy } from "lucide-react"
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
import { TOURNAMENTS_PAGE_SIZE, useTournaments, type Tournament } from "@/lib/tournaments"
import { useDebouncedValue } from "@/lib/use-debounced-value"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
const MAX_TAGS = 3

function VisibilityBadge({ visibility }: { visibility: Tournament["visibility"] }) {
    return (
        <Badge variant={visibility === "PRIVATE" ? "secondary" : "outline"}>
            {visibility === "PRIVATE" ? "Private" : "Public"}
        </Badge>
    )
}

export function TournamentsPage() {
    const [searchInput, setSearchInput] = useState("")
    const [offset, setOffset] = useState(0)

    const search = useDebouncedValue(searchInput)

    const { data, error, isPending, isError, isFetching } = useTournaments({
        search,
        limit: TOURNAMENTS_PAGE_SIZE,
        offset,
    })

    const total = data?.total ?? 0
    const items = data?.items ?? []
    const first = total === 0 ? 0 : offset + 1
    const last = Math.min(offset + TOURNAMENTS_PAGE_SIZE, total)
    const canGoBack = offset > 0
    const canGoForward = offset + TOURNAMENTS_PAGE_SIZE < total

    return (
        <Page>
            <PageHeader
                title="Tournaments"
                description={data ? `${total} tournament${total === 1 ? "" : "s"}` : undefined}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">All tournaments</CardTitle>
                    <CardDescription>Open one to manage its seasons.</CardDescription>
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

                <CardContent className="p-0">
                    {isPending ? (
                        <ListSkeleton />
                    ) : isError ? (
                        <ErrorPanel
                            message={
                                error instanceof Error
                                    ? error.message
                                    : "Could not load tournaments."
                            }
                        />
                    ) : items.length === 0 ? (
                        <EmptyState
                            icon={search ? SearchX : Trophy}
                            title={search ? "No tournaments match that search" : "No tournaments yet"}
                            description={
                                search
                                    ? "Try a shorter term, or clear the search."
                                    : "Once a tournament exists, its seasons and draws live here."
                            }
                            action={
                                search ? (
                                    <Button variant="outline" onClick={() => setSearchInput("")}>
                                        Clear search
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <Table className={isFetching ? "opacity-60 transition-opacity" : undefined}>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead>Visibility</TableHead>
                                    <TableHead>Tags</TableHead>
                                    <TableHead>Created</TableHead>
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
                                        <TableCell className="font-mono text-xs">
                                            {tournament.slug}
                                        </TableCell>
                                        <TableCell>
                                            <VisibilityBadge visibility={tournament.visibility} />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1">
                                                {tournament.defaultTags
                                                    .slice(0, MAX_TAGS)
                                                    .map((tag) => (
                                                        <Badge key={tag} variant="outline">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                {tournament.defaultTags.length > MAX_TAGS && (
                                                    <span className="text-xs text-muted-foreground">
                                                        +{tournament.defaultTags.length - MAX_TAGS}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {dateFormat.format(new Date(tournament.createdAt))}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>

                {items.length > 0 && total > TOURNAMENTS_PAGE_SIZE && (
                    <CardFooter className="justify-between">
                        <p className="text-sm text-muted-foreground">
                            {first}–{last} of {total}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canGoBack}
                                onClick={() =>
                                    setOffset((current) =>
                                        Math.max(0, current - TOURNAMENTS_PAGE_SIZE)
                                    )
                                }
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canGoForward}
                                onClick={() =>
                                    setOffset((current) => current + TOURNAMENTS_PAGE_SIZE)
                                }
                            >
                                Next
                            </Button>
                        </div>
                    </CardFooter>
                )}
            </Card>
        </Page>
    )
}