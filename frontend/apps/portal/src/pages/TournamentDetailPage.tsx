import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { CalendarDays, ChevronRight } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"

import { EditTournamentDialog } from "@/components/edit-tournament-dialog"
import { EmptyState, ListSkeleton, Page, PageHeader } from "@/components/page"
import { useSeasons } from "@/lib/seasons"
import { useTournament } from "@/lib/tournaments"


function configSummary(format: { competitorsPerMatch: number }): string {
    return `${format.competitorsPerMatch} players/match · the staff place every match`
}

export function TournamentDetailPage() {
    const { id = "" } = useParams<{ id: string }>()
    const { data, error, isPending, isError } = useTournament(id)
    const seasons = useSeasons(id)
    const [editOpen, setEditOpen] = useState(false)

    if (isPending) return <p className="p-6 text-sm text-muted-foreground">Loading tournament…</p>

    if (isError || !data) {
        return (
            <div className="flex flex-col gap-4 p-6">
                <p role="alert" className="text-sm text-destructive">
                    {error instanceof Error ? error.message : "Could not load this tournament."}
                </p>
                <Link className="text-sm underline underline-offset-2" to="/">
                    Back to tournaments
                </Link>
            </div>
        )
    }

    const seasonItems = seasons.data?.items ?? []

    return (
        <Page className="max-w-6xl">
            <div className="flex flex-col gap-3">
                <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Link className="transition-colors hover:text-foreground" to="/">
                        Tournaments
                    </Link>
                    <ChevronRight className="size-3.5" />
                    <span className="text-foreground">{data.name}</span>
                </nav>

                <PageHeader
                    title={data.name}
                    description={data.slug}
                    actions={
                        <div className="flex items-center gap-2">
                            {data.defaultTags.map((tag) => (
                                <Badge key={tag} variant="outline">
                                    {tag}
                                </Badge>
                            ))}
                            <Badge variant={data.visibility === "PRIVATE" ? "secondary" : "outline"}>
                                {data.visibility === "PRIVATE" ? "Private" : "Public"}
                            </Badge>
                            <Button size="sm" onClick={() => setEditOpen(true)}>
                                Edit
                            </Button>
                        </div>
                    }
                />

                <p className="text-sm text-muted-foreground">
                    {configSummary(data.defaultFormat)}
                </p>
            </div>

            <Card className="[--card-spacing:--spacing(6)]">
                <CardHeader>
                    <CardTitle className="text-base">Default points for places</CardTitle>
                    <CardDescription>
                        The points a new season starts with. A season owns its own scale.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {data.defaultPlacementTiers.length === 0 ? (
                        <p className="px-6 pb-6 text-sm text-muted-foreground">
                            This tournament awards no points for places. Edit it to add a scale.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-6">Place</TableHead>
                                    <TableHead className="pr-6 text-right">Points</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.defaultPlacementTiers.map((tier) => (
                                    <TableRow key={`${tier.min}-${tier.max}`}>
                                        <TableCell className="pl-6">
                                            {tier.min === tier.max
                                                ? tier.min
                                                : `${tier.min} – ${tier.max}`}
                                        </TableCell>
                                        <TableCell className="pr-6 text-right tabular-nums">
                                            {tier.points}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card className="[--card-spacing:--spacing(6)]">
                <CardHeader>
                    <CardTitle className="text-base">Seasons</CardTitle>
                    <CardDescription>
                        Each season inherits the configuration above, and may override it.
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-0 [&_th:first-child]:pl-(--card-spacing) [&_td:first-child]:pl-(--card-spacing) [&_th:last-child]:pr-(--card-spacing) [&_td:last-child]:pr-(--card-spacing)">
                    {seasons.isPending ? (
                        <ListSkeleton rows={3} />
                    ) : seasonItems.length === 0 ? (
                        <EmptyState
                            icon={CalendarDays}
                            title="No seasons yet"
                            description="A season is one run of this tournament: its rounds, players and matches."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Rounds</TableHead>
                                    <TableHead>Stages</TableHead>
                                    <TableHead>Seats</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {seasonItems.map((season) => {
                                    return (
                                        <TableRow key={season.id}>
                                            <TableCell className="font-medium">
                                                <Link
                                                    className="underline-offset-2 hover:underline"
                                                    to={`/tournaments/${data.id}/seasons/${season.id}`}
                                                >
                                                    {season.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="flex items-center">
                                                {season.rounds.length}
                                            </TableCell>
                                            <TableCell>
                                                {season.stages.length}
                                            </TableCell>
                                            <TableCell className="tabular-nums">
                                                {season.format.competitorsPerMatch}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    {season.current && <Badge>Current</Badge>}
                                                    {season.closedAt && (
                                                        <Badge variant="secondary">Closed</Badge>
                                                    )}
                                                    {!season.current && !season.closedAt && (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <EditTournamentDialog tournament={data} open={editOpen} onOpenChange={setEditOpen} />
        </Page>
    )
}