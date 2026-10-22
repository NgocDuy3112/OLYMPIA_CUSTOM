import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useRecomputeStandings, useStandings } from "@/lib/season"


// The points table. It is never typed in: it follows the points of the matches that were
// played, and it is recomputed whenever a match ends.
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
                    {rows.length === 0
                        ? "No points matches have been played yet."
                        : "Points from every points match of the season."}
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
                        The table fills itself when a match ends.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16 pl-6">Place</TableHead>
                                <TableHead>Player</TableHead>
                                <TableHead className="w-24 text-right">Matches</TableHead>
                                <TableHead className="w-24 pr-6 text-right">Points</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.userId}>
                                    <TableCell className="pl-6 tabular-nums">
                                        <span className="flex items-center gap-2">
                                            {row.rank}
                                            {row.placementPoints > 0 && (
                                                <Badge variant="outline">+{row.placementPoints}</Badge>
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell>{row.displayName}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.matchesPlayed}</TableCell>
                                    <TableCell className="pr-6 text-right tabular-nums">{row.totalScore}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
