import { useState } from "react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useCloseSplitting, useSplitting } from "@/lib/progression"
import { MatchResultDialog } from "./match-result-dialog"
import { NewSplittingMatchDialog } from "./splitting-match-dialog"


const short = (id: string) => id.slice(0, 8)


export function SplittingTab({ tournamentId, seasonId }: { tournamentId: string; seasonId: string }) {
    const view = useSplitting(tournamentId, seasonId)
    const close = useCloseSplitting(tournamentId, seasonId)

    const [newMatchRound, setNewMatchRound] = useState<number | null>(null)
    const [result, setResult] = useState<{ id: string; label: string; players: string[] } | null>(null)

    if (view.isPending) return <p className="text-sm text-muted-foreground">Loading splitting…</p>
    if (view.isError) return <p role="alert" className="text-sm text-destructive">{view.error.message}</p>

    const data = view.data
    const nameOf = (userId: string) => data.roster[userId] ?? `Unknown (${short(userId)})`

    const roundFinished = (index: number) => {
        const stage = data.stages[index]
        return Boolean(
            stage && stage.matches.length > 0 && stage.matches.every((match) => match.status === "FINISHED")
        )
    }

    const bothPlayed = data.stages.every((_, index) => roundFinished(index))
    const canClose = bothPlayed && !data.closed

    return (
        <div className="flex flex-col gap-4">
            {data.stages.map((stage, index) => {
                const round = index + 1
                const matches = [...stage.matches].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
                const freeSlots = Array.from({ length: data.groupSize }, (_, i) => i + 1)
                    .filter((slot) => !matches.some((match) => match.slot === slot))

                return (
                    <Card key={stage.stageId} className="[--card-spacing:--spacing(6)]">
                        <CardHeader>
                            <CardTitle className="text-base">Round {round}</CardTitle>
                            <CardDescription>
                                {matches.length === 0
                                    ? `No matches yet. A round is ${data.groupSize} matches of ${data.groupSize}.`
                                    : `${matches.length} of ${data.groupSize} matches · ${matches.filter((m) => m.status === "FINISHED").length} finished`}
                            </CardDescription>
                            {freeSlots.length > 0 && (
                                <CardAction>
                                    <Button size="sm" variant="outline" onClick={() => setNewMatchRound(round)}>
                                        Add match
                                    </Button>
                                </CardAction>
                            )}
                        </CardHeader>

                        <CardContent className="p-0">
                            {matches.length === 0 ? (
                                <p className="px-6 pb-6 text-sm text-muted-foreground">
                                    Add the first match to get started.
                                </p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-20 pl-6">Match</TableHead>
                                            <TableHead>Players</TableHead>
                                            <TableHead className="w-40 pr-6 text-right">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {matches.map((match) => (
                                            <TableRow key={match.id}>
                                                <TableCell className="pl-6 text-muted-foreground">
                                                    {match.slot}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {match.players.map((userId) => (
                                                            <span key={userId} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                                                {nameOf(userId)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="pr-6 text-right">
                                                    {match.status === "FINISHED" ? (
                                                        <Badge variant="secondary">FINISHED</Badge>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() =>
                                                                setResult({ id: match.id, label: match.label, players: match.players })
                                                            }
                                                        >
                                                            Enter result
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                )
            })}

            {(data.rank || bothPlayed) && (
                <Card className="[--card-spacing:--spacing(6)]">
                    <CardHeader>
                        <CardTitle className="text-base">Final order</CardTitle>
                        <CardDescription>
                            Round 2 decides; round 1 breaks ties. This order seeds the ladder.
                        </CardDescription>
                        {canClose && (
                            <CardAction>
                                <Button size="sm" disabled={close.isPending} onClick={() => close.mutate({})}>
                                    {close.isPending ? "Closing…" : "Close splitting"}
                                </Button>
                            </CardAction>
                        )}
                    </CardHeader>

                    <CardContent className="p-0">
                        {data.rank ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-20 pl-6">Rank</TableHead>
                                        <TableHead>Player</TableHead>
                                        <TableHead className="pr-6 text-right">Round 2 points</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.rank.map((row) => (
                                        <TableRow key={row.userId}>
                                            <TableCell className="pl-6 text-muted-foreground">{row.rank}</TableCell>
                                            <TableCell>{nameOf(row.userId)}</TableCell>
                                            <TableCell className="pr-6 text-right tabular-nums">{row.score}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="px-6 pb-6 text-sm text-muted-foreground">
                                {bothPlayed
                                    ? "Both rounds played. Close the phase to write the order."
                                    : "Finish both rounds' matches before closing."}
                            </p>
                        )}
                        {close.isError && canClose && (
                            <p className="px-6 pb-6 text-sm text-destructive">{close.error.message}</p>
                        )}
                    </CardContent>
                </Card>
            )}

            {newMatchRound !== null && (
                <NewSplittingMatchDialog
                    tournamentId={tournamentId}
                    seasonId={seasonId}
                    round={newMatchRound}
                    seats={data.seats}
                    slots={Array.from({ length: data.groupSize }, (_, i) => i + 1).filter(
                        (slot) => !data.stages[newMatchRound - 1].matches.some((match) => match.slot === slot)
                    )}
                    open
                    onOpenChange={(open) => { if (!open) setNewMatchRound(null) }}
                />
            )}

            {result && (
                <MatchResultDialog
                    tournamentId={tournamentId}
                    seasonId={seasonId}
                    matchId={result.id}
                    label={result.label}
                    players={result.players.map((userId) => ({ userId, name: nameOf(userId) }))}
                    open
                    onOpenChange={(open) => { if (!open) setResult(null) }}
                />
            )}
        </div>
    )
}