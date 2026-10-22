import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"

import { useSeasons, type Season } from "@/lib/seasons"
import { useTournament } from "@/lib/tournaments"
import { NewSeasonDialog } from "@/components/new-season-dialog"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

function SeasonsTable({ tournamentId, seasons }: { tournamentId: string, seasons: Season[] }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Stages</TableHead>
                    <TableHead>Rounds</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {seasons.map((season) => (
                    <TableRow key={season.id}>
                        <TableCell className="font-medium">
                            <Link to={`/tournaments/${tournamentId}/seasons/${season.id}`}>
                                {season.name}
                            </Link>
                        </TableCell>
                        <TableCell>{season.stages.length}</TableCell>
                        <TableCell>{season.rounds.length}</TableCell>
                        <TableCell className="text-muted-foreground">
                            {dateFormat.format(new Date(season.createdAt))}
                        </TableCell>
                        <TableCell className="flex gap-2">
                            {season.current && <Badge>Current</Badge>}
                            {season.closedAt && <Badge variant="secondary">Closed</Badge>}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}


export function SeasonsPage() {
    const { tournamentId = "" } = useParams<{ tournamentId: string }>()
    const { data: tournament } = useTournament(tournamentId)
    const { data, error, isPending, isError } = useSeasons(tournamentId)
    const [creating, setCreating] = useState(false)

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
            <div className="flex flex-col gap-1">
                <Link
                    className="text-sm text-muted-foreground underline underline-offset-2"
                    to={`/tournaments/${tournamentId}`}
                >
                    ← {tournament?.name ?? "Tournament"}
                </Link>
                <h1 className="text-2xl font-bold">Seasons</h1>
            </div>
            {isPending && (
                <p className="text-sm text-muted-foreground">Loading seasons…</p>
            )}
            {isError && (
                <p role="alert" className="text-sm text-destructive">
                    {error instanceof Error ? error.message : "Could not load seasons."}
                </p>
            )}
            {data?.items.length === 0 && (
                <p className="text-sm text-muted-foreground">No seasons yet.</p>
            )}
            {data && data.items.length > 0 && (
                <SeasonsTable tournamentId={tournamentId} seasons={data.items} />
            )}

            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                New season
            </Button>

            {creating && (
                <NewSeasonDialog
                    tournamentId={tournamentId}
                    open
                    onOpenChange={(open) => { if (!open) setCreating(false) }}
                />
            )}
        </div>
    )
}