import { useState, type ReactNode } from "react"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import type { TournamentDetail } from "@/lib/tournament"
import { EditStagesDialog } from "./edit-stages-dialog"


export function StagesTab({
    tournamentId,
    tournament,
}: {
    tournamentId: string
    tournament: TournamentDetail
}) {
    const [editing, setEditing] = useState(false)

    const stages = tournament.stages ?? []

    let stagesSlot: ReactNode = (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-16 pl-6">#</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="font-mono text-xs">Id</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead className="pr-6">Dates</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {stages.map((stage, index) => {
                    let dateText = "—"
                    if (stage.start) dateText = new Date(stage.start).toLocaleDateString()
                    return (
                        <TableRow key={stage.id}>
                            <TableCell className="pl-6 tabular-nums">{index + 1}</TableCell>
                            <TableCell className="font-medium">{stage.title}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                                {stage.id}
                            </TableCell>
                            <TableCell className="pr-6 text-sm text-muted-foreground">
                                {dateText}
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
    if (stages.length === 0) {
        stagesSlot = (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
                No stages yet. A match has to name one, so add them before creating matches.
            </p>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Stages</CardTitle>
                <CardDescription>
                    The order of the tournament. A match belongs to a stage, and the last stage a
                    player reached is what places them.
                </CardDescription>
                <CardAction>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                        Edit stages
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {stagesSlot}
            </CardContent>

            {editing && (
                <EditStagesDialog
                    tournamentId={tournamentId}
                    tournament={tournament}
                    open
                    onOpenChange={(open) => { if (!open) setEditing(false) }}
                />
            )}
        </Card>
    )
}
