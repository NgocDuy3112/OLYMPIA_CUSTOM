import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import type { TournamentDetail } from "@/lib/tournament"
import { TournamentPointsDialog } from "./tournament-points-dialog"


// The tournament's points for places. The tournament is the unit: the tournament hands down a
// default, and the tournament — which knows how many places it produces — owns the scale.
export function TournamentPointsCard({
    tournamentId,
    tournament,
}: {
    tournamentId: string
    tournament: TournamentDetail
}) {
    const [editing, setEditing] = useState(false)

    const tiers = tournament.placementTiers ?? []
    const coverage = tournament.points

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Points for places</CardTitle>
                <CardDescription>
                    What each place of this tournament is worth. The tournament owns its scale.
                </CardDescription>
                <CardAction>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                        Edit points
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {tiers.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                        This tournament awards no points for places.
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
                            {tiers.map((tier) => (
                                <TableRow key={`${tier.min}-${tier.max}`}>
                                    <TableCell className="pl-6">
                                        {tier.min === tier.max ? tier.min : `${tier.min} – ${tier.max}`}
                                    </TableCell>
                                    <TableCell className="pr-6 text-right tabular-nums">
                                        {tier.points}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                {coverage && coverage.missing.length > 0 && (
                    <p className="flex items-center gap-2 px-6 py-4 text-sm text-amber-600">
                        <AlertTriangle className="size-4" />
                        {coverage.missing.length === 1
                            ? `Place ${coverage.missing[0]} has no band — it would score nothing.`
                            : `Places ${coverage.missing[0]}–${coverage.missing[coverage.missing.length - 1]} have no band — they would score nothing.`}
                    </p>
                )}

                {coverage && coverage.beyond.length > 0 && (
                    <p className="flex items-center gap-2 px-6 pb-4 text-sm text-muted-foreground">
                        The scale reaches place {coverage.beyond[0]}, and this tournament produces{" "}
                        {coverage.places} places.
                    </p>
                )}
            </CardContent>

            {editing && (
                <TournamentPointsDialog
                    tournamentId={tournamentId}
                    tournament={tournament}
                    open
                    onOpenChange={(open) => { if (!open) setEditing(false) }}
                />
            )}
        </Card>
    )
}
