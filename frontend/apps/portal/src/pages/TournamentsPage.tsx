import { useState } from "react"
import { Link } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shared/ui/table"

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
    const first = total === 0 ? 0 : offset + 1
    const last = Math.min(offset + TOURNAMENTS_PAGE_SIZE, total)
    const canGoBack = offset > 0
    const canGoForward = offset + TOURNAMENTS_PAGE_SIZE < total

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold">Tournaments</h1>
                <p className="text-sm text-muted-foreground">
                    {data ? `${total} total` : "\u00a0"}
                </p>
            </div>

            <Input
                className="max-w-sm"
                placeholder="Search by name or slug…"
                value={searchInput}
                onChange={(event) => {
                    setSearchInput(event.target.value)
                    // A new search starts from the first page, not the current offset.
                    setOffset(0)
                }}
            />

            {isPending && (
                <p className="text-sm text-muted-foreground">Loading tournaments…</p>
            )}

            {isError && (
                <p role="alert" className="text-sm text-destructive">
                    {error instanceof Error ? error.message : "Could not load tournaments."}
                </p>
            )}

            {data?.items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No tournaments match that search.
                </p>
            )}

            {data && data.items.length > 0 && (
                <>
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
                            {data.items.map((tournament) => (
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

                    <div className="flex items-center justify-between gap-4">
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
                    </div>
                </>
            )}
        </div>
    )
}