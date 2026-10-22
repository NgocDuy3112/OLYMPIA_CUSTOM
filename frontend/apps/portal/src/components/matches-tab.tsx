import { useState } from "react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useEnrolled, useMatches, type SeasonDetail } from "@/lib/season"
import { MassEventDialog } from "./mass-event-dialog"
import { MatchResultDialog } from "./match-result-dialog"
import { NewMatchDialog } from "./new-match-dialog"


const short = (id: string) => id.slice(0, 8)


// Every match of the season. The staff create them; the system plays and scores them.
export function MatchesTab({
    tournamentId,
    seasonId,
    season,
    seats,
}: {
    tournamentId: string
    seasonId: string
    season: SeasonDetail
    seats: number
}) {
    const matches = useMatches(tournamentId, seasonId)
    const enrolled = useEnrolled(tournamentId, seasonId)

    const [creating, setCreating] = useState(false)
    const [result, setResult] = useState<{ id: string; label: string; players: string[] } | null>(null)
    const [massEvent, setMassEvent] = useState<{ id: string; label: string } | null>(null)

    if (matches.isPending) return <p className="text-sm text-muted-foreground">Loading matches…</p>
    if (matches.isError) return <p role="alert" className="text-sm text-destructive">{matches.error.message}</p>

    const data = matches.data
    const names = new Map((enrolled.data?.items ?? []).map((row) => [row.userId, row.displayName]))
    const nameOf = (userId: string) => names.get(userId) ?? `Unknown (${short(userId)})`

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Matches</CardTitle>
                    <CardDescription>
                        {data.items.length === 0
                            ? "No matches yet. Create the first one."
                            : `${data.items.length} match${data.items.length === 1 ? "" : "es"}`}
                    </CardDescription>
                    <CardAction>
                        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                            New match
                        </Button>
                    </CardAction>
                </CardHeader>

                <CardContent className="p-0">
                    {data.items.length === 0 ? (
                        <p className="px-6 pb-6 text-sm text-muted-foreground">
                            A points match seats {seats} players. The mass event seats the whole roster.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-6">Match</TableHead>
                                    <TableHead>Players</TableHead>
                                    <TableHead className="w-40 pr-6 text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.items.map((match) => {
                                    const seated = match.players.flatMap((seat) =>
                                        seat.userId ? [seat.userId] : [])
                                    return (
                                        <TableRow key={match.id}>
                                            <TableCell className="pl-6">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{match.label}</span>
                                                    {match.kind === "QUALIFICATION" && (
                                                        <Badge variant="outline">Mass event</Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground">{match.stageId}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {seated.map((userId) => (
                                                        <span key={userId} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                                            {nameOf(userId)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="pr-6 text-right">
                                                {match.status === "FINISHED" ? (
                                                    <Badge variant="secondary">FINISHED</Badge>
                                                ) : match.kind === "QUALIFICATION" ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            setMassEvent({ id: match.id, label: match.label })
                                                        }
                                                    >
                                                        Field ranking
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            setResult({ id: match.id, label: match.label, players: seated })
                                                        }
                                                    >
                                                        Enter result
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {creating && (
                <NewMatchDialog
                    tournamentId={tournamentId}
                    seasonId={seasonId}
                    season={season}
                    seats={seats}
                    open
                    onOpenChange={(open) => { if (!open) setCreating(false) }}
                />
            )}

            {massEvent && (
                <MassEventDialog
                    tournamentId={tournamentId}
                    seasonId={seasonId}
                    matchId={massEvent.id}
                    label={massEvent.label}
                    seats={seats}
                    open
                    onOpenChange={(open) => { if (!open) setMassEvent(null) }}
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
