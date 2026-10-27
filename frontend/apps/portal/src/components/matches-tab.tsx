import { useState } from "react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useEnrolled, useMatches, type TournamentDetail } from "@/lib/tournament"
import { NewMatchDialog } from "./new-match-dialog"


const short = (id: string) => id.slice(0, 8)


// Every match of the tournament. The staff create them; the system plays and scores them.
export function MatchesTab({
    tournamentId,
    tournament,
    seats,
}: {
    tournamentId: string
    tournament: TournamentDetail
    seats: number
}) {
    const matches = useMatches(tournamentId)
    const enrolled = useEnrolled(tournamentId)

    const [creating, setCreating] = useState(false)
    // The control room opens in ITS OWN TAB: the matches list stays exactly where
    // the staff left it — they run the event beside the list, not instead of it.
    const openMatch = (matchId: string) =>
        window.open(`/tournaments/${tournamentId}/matches/${matchId}`, "_blank")
    // A match of ≤4 players is played deck-first: Control opens the full-screen
    // StageShell route (the MC's own view), not the page around it.
    const openStage = (matchId: string) =>
        window.open(`/tournaments/${tournamentId}/matches/${matchId}/stage`, "_blank")

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
                            A match seats {seats} players.
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
                                                {match.kind === "QUALIFICATION" ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => openMatch(match.id)}
                                                    >
                                                        {match.status === "FINISHED" ? "Ranking" : "Control"}
                                                    </Button>
                                                ) : match.status === "FINISHED" ? (
                                                    <Badge variant="secondary">FINISHED</Badge>
                                                ) : (
                                                    <div className="flex flex-col items-end gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => openStage(match.id)}
                                                        >
                                                            Control
                                                        </Button>
                                                        {match.joinCode && (
                                                            <span
                                                                className="font-mono text-xs tracking-widest text-muted-foreground"
                                                                title="Mã thí sinh nhập ở /join"
                                                            >
                                                                PIN {match.joinCode}
                                                            </span>
                                                        )}
                                                    </div>
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
                    tournament={tournament}
                    seats={seats}
                    open
                    onOpenChange={(open) => { if (!open) setCreating(false) }}
                />
            )}
        </div>
    )
}
