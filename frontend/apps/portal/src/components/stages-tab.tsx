import { useState } from "react"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import type { SeasonDetail } from "@/lib/season"
import { EditStagesDialog } from "./edit-stages-dialog"


// The season's stages, in order. This order is how far the rounds go, and it decides the
// season's places: a player who got to a later stage placed above one who did not.
export function StagesTab({
    tournamentId,
    seasonId,
    season,
}: {
    tournamentId: string
    seasonId: string
    season: SeasonDetail
}) {
    const [editing, setEditing] = useState(false)

    const stages = season.stages ?? []

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Stages</CardTitle>
                <CardDescription>
                    The order of the season. A match belongs to a stage, and the last stage a
                    player reached is what places them.
                </CardDescription>
                <CardAction>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                        Edit stages
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {stages.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                        No stages yet. A match has to name one, so add them before creating matches.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16 pl-6">#</TableHead>
                                <TableHead>Stage</TableHead>
                                <TableHead className="font-mono text-xs">Id</TableHead>
                                <TableHead className="pr-6">Dates</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stages.map((stage, index) => (
                                <TableRow key={stage.id}>
                                    <TableCell className="pl-6 tabular-nums">{index + 1}</TableCell>
                                    <TableCell className="font-medium">{stage.title}</TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                        {stage.id}
                                    </TableCell>
                                    <TableCell className="pr-6 text-sm text-muted-foreground">
                                        {stage.start
                                            ? new Date(stage.start).toLocaleDateString()
                                            : "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            {editing && (
                <EditStagesDialog
                    tournamentId={tournamentId}
                    seasonId={seasonId}
                    season={season}
                    open
                    onOpenChange={(open) => { if (!open) setEditing(false) }}
                />
            )}
        </Card>
    )
}
