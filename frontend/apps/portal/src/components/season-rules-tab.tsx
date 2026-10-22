import { useState } from "react"
import { Check, Pencil } from "lucide-react"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import type { SeasonDetail } from "@/lib/season"
import { draftFrom, kindsLabel, pointsLabel, questionCountOf } from "@/lib/rules"
import { SeasonRulesDialog } from "./season-rules-dialog"

// The rulebook, read. Every change happens in the dialog.
export function SeasonRulesTab({
    tournamentId,
    seasonId,
    season,
    frozen,
}: {
    tournamentId: string
    seasonId: string
    season: SeasonDetail
    frozen: boolean
}) {
    const [editing, setEditing] = useState(false)

    const rounds = [...season.rounds].sort((a, b) => a.order - b.order)
    const shown = draftFrom(season)
    const total = Object.values(shown).reduce((sum, config) => sum + questionCountOf(config), 0)

    return (
        <Card className="[--card-spacing:--spacing(6)]">
            <CardHeader>
                <CardTitle className="text-base">Round rules</CardTitle>
                <CardDescription>
                    What every match of this season plays. Only the fields the engine honours are editable.
                </CardDescription>
                <CardAction>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={frozen}>
                        <Pencil className="size-3.5" />
                        Edit rules
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="pl-6">Round</TableHead>
                            <TableHead>Turn</TableHead>
                            <TableHead>Allowed kinds</TableHead>
                            <TableHead className="w-28">Points</TableHead>
                            <TableHead className="w-28 pr-6 text-right">Questions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rounds.flatMap((round) => {
                            const config = shown[round.id]

                            return config.turns.map((turn, turnIndex) => (
                                <TableRow key={`${round.id}-${turn.id}`}>
                                    <TableCell className="pl-6 align-top">
                                        {turnIndex === 0 ? (
                                            <div className="flex flex-col">
                                                <span className="font-medium">{round.name}</span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {round.id}
                                                </span>
                                            </div>
                                        ) : null}
                                    </TableCell>
                                    <TableCell className="align-top font-mono text-xs">{turn.id}</TableCell>
                                    <TableCell className="align-top">
                                        <span className="text-xs">{kindsLabel(config)}</span>
                                    </TableCell>
                                    <TableCell className="align-top">
                                        <span className="text-xs">{pointsLabel(config)}</span>
                                    </TableCell>
                                    <TableCell className="pr-6 text-right align-top">
                                        <span className="text-xs tabular-nums">
                                            {turn.questionCount ?? 0}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))
                        })}
                    </TableBody>
                </Table>
            </CardContent>

            <CardFooter className="justify-between gap-4 border-t">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="size-4 text-emerald-600" />
                    {total} questions per match
                </p>

                {frozen && (
                    <p className="text-sm text-muted-foreground">
                        Frozen: a match has already been assembled for this season.
                    </p>
                )}
            </CardFooter>

            {editing && (
                <SeasonRulesDialog
                    tournamentId={tournamentId}
                    seasonId={seasonId}
                    season={season}
                    frozen={frozen}
                    open
                    onOpenChange={(open) => { if (!open) setEditing(false) }}
                />
            )}
        </Card>
    )
}
