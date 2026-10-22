import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useRecomputeStandings, useStandings } from "@/lib/tournament"


// The tournament's places. A player is placed by how far they got — the last stage they
// reached, the match they were eliminated in, and their rank in it. The points are a
// statistic, not the ranking key.
export function StandingsTab({ tournamentId }: { tournamentId: string }) {
    const standings = useStandings(tournamentId)
    const recompute = useRecomputeStandings(tournamentId)

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
                    The tournament's places, by how far each player got. The points are what the
                    place is worth; the match points belong to the match.
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
                        No players are enrolled in this tournament yet.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16 pl-6">Place</TableHead>
                                <TableHead>Player</TableHead>
                                <TableHead>Got to</TableHead>
                                <TableHead className="w-24 text-right">Matches</TableHead>
                                <TableHead className="w-24 pr-6 text-right">Points</TableHead>
                                <TableHead>Tie-break</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.userId}>
                                    <TableCell className="pl-6 tabular-nums">
                                        {row.place ?? <span className="text-muted-foreground">—</span>}
                                    </TableCell>
                                    <TableCell className="font-medium">{row.displayName}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {row.stageTitle
                                            ? `${row.stageTitle}${row.slot !== null ? ` · match ${row.slot}` : ""}`
                                            : "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{row.matchesPlayed}</TableCell>
                                    <TableCell className="pr-6 text-right tabular-nums">
                                        {row.placementPoints > 0 ? `+${row.placementPoints}` : "—"}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
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
