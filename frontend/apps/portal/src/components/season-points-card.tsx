import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useTournament } from "@/lib/tournaments"
import type { SeasonDetail } from "@/lib/season"
import { SeasonPointsDialog } from "./season-points-dialog"


// The season's points for places. The season is the unit: the tournament hands down a
// default, and the season — which knows how many places it produces — owns the scale.
export function SeasonPointsCard({
    tournamentId,
    seasonId,
    season,
}: {
    tournamentId: string
    seasonId: string
    season: SeasonDetail
}) {
    const tournament = useTournament(tournamentId)
    const [editing, setEditing] = useState(false)

    const tiers = season.placementTiers ?? []
    const coverage = season.points
    const defaultTiers = tournament.data?.defaultPlacementTiers ?? []
    const inherited = defaultTiers.length > 0
        && JSON.stringify(tiers) === JSON.stringify(defaultTiers)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Points for places</CardTitle>
                <CardDescription>
                    What each place of this season is worth.
                    {inherited && " Inherited from the tournament."}
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
                        This season awards no points for places.
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
                        The scale reaches place {coverage.beyond[0]}, and this season produces{" "}
                        {coverage.places} places.
                    </p>
                )}
            </CardContent>

            {editing && (
                <SeasonPointsDialog
                    tournamentId={tournamentId}
                    seasonId={seasonId}
                    season={season}
                    defaultTiers={defaultTiers}
                    open
                    onOpenChange={(open) => { if (!open) setEditing(false) }}
                />
            )}
        </Card>
    )
}
