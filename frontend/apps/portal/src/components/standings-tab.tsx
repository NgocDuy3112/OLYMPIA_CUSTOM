import type { ReactNode } from "react"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { errorMessage } from "@shared/lib/error-text"
import { ErrorPanel, ListSkeleton } from "@/components/page"
import { useRecomputeStandings, useStandings } from "@/lib/tournament"


export function StandingsTab({ tournamentId }: { tournamentId: string }) {
    const standings = useStandings(tournamentId)
    const recompute = useRecomputeStandings(tournamentId)

    if (standings.isPending) {
        return <ListSkeleton />
    }
    if (standings.isError) {
        return <ErrorPanel message={errorMessage(standings.error)} />
    }

    const rows = standings.data.rows

    let recomputeLabel = "Recompute"
    if (recompute.isPending) recomputeLabel = "Recomputing…"

    let standingsSlot: ReactNode = (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-16 pl-6">Place</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Got to</TableHead>
                    <TableHead className="w-24 pr-6 text-right">Matches</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => {
                    let stageText = "—"
                    if (row.stageTitle) {
                        stageText = `${row.stageTitle}`
                        if (row.slot !== null) stageText = `${row.stageTitle} · match ${row.slot}`
                    }
                    return (
                        <TableRow key={row.userId}>
                            <TableCell className="pl-6 tabular-nums">
                                {row.place ?? <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="font-medium">{row.displayName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                                {stageText}
                            </TableCell>
                            <TableCell className="pr-6 text-right tabular-nums">{row.matchesPlayed}</TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
    if (rows.length === 0) {
        standingsSlot = (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
                No players are enrolled in this tournament yet.
            </p>
        )
    }

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
                        {recomputeLabel}
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {standingsSlot}
            </CardContent>
        </Card>
    )
}
