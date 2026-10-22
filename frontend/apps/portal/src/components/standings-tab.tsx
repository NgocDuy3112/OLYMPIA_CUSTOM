import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useRecomputeStandings, useStandings } from "@/lib/season"


// The season's places. A player is placed by how far they got — the last stage they
// reached, the match they were eliminated in, and their rank in it. The points are a
// statistic, not the ranking key.
export function StandingsTab({
    tournamentId,
    seasonId,
}: {
    tournamentId: string
    seasonId: string
}) {
    const standings = useStandings(tournamentId, seasonId)
    const recompute = useRecomputeStandings(tournamentId, seasonId)

    if (standings.isPending) {
        return <p className="text-sm text-muted-foreground">Loading standings…</p>
    }
    if (standings.isError) {
        return <p role="alert" className="text-sm text-destructive">{standings.error.message}</p>
    }

    const rows = standings.data.rows

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Standings</CardTitle>
                <CardDescription>
                    The season's places, by how far each player got. Points are shown for
                    reference — they do not decide the order.
                </CardDescription>
                <CardAction>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={recompute.isPending}
                        onClick={() => recompute.mutate()}
                    >
                        {recompute.isPending ? "Recomputing…" : "Recompute"}
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {rows.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                        No players are enrolled in this season yet.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16 pl-6">Place</TableHead>
                                <TableHead>Player</TableHead>
                                <TableHead>Got to</TableHead>
                                <TableHead className="w-24 text-right">Matches</TableHead>
                                <TableHead className="w-24 text-right">Points</TableHead>
                                <TableHead className="w-20 text-right">Bonus</TableHead>
                                <TableHead className="pr-6">Tie-break</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.userId}>
                                    <TableCell className="pl-6 tabular-nums">
                                        {row.place ?? <span className="text-muted-foreground">—</span>}
                                    </TableCell>
                                    <TableCell>
                                        <span className="flex items-center gap-2">
                                            {row.displayName}
                                            {row.placementPoints > 0 && (
                                                <Badge variant="outline">+{row.placementPoints}</Badge>
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {row.stageTitle
                                            ? `${row.stageTitle}${row.slot !== null ? ` · match ${row.slot}` : ""}`
                                            : "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{row.matchesPlayed}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.totalPoints}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.placementPoints > 0 ? `+${row.placementPoints}` : "—"}
                                    </TableCell>
                                    <TableCell className="pr-6 text-sm text-muted-foreground">
                                        {row.tieBreak ?? "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
