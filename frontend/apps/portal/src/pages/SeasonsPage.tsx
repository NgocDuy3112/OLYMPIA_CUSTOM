import { useState, type SubmitEvent } from "react"
import { Link, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { Separator } from "@shared/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"

import { useCreateSeason, useSeasons, type Season } from "@/lib/seasons"
import { useTournament } from "@/lib/tournaments"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

interface StageDraft {
    id: string
    title: string
    start: string
    end: string
}

function emptyStage(): StageDraft {
    return { id: crypto.randomUUID(), title: "", start: "", end: "" }
}


function toIso(local: string): string {
    return new Date(local).toISOString()
}

function NewSeasonForm({ tournamentId }: { tournamentId: string }) {
    const create = useCreateSeason(tournamentId)

    const [name, setName] = useState("")
    const [current, setCurrent] = useState(false)
    const [stages, setStages] = useState<StageDraft[]>([])

    const updateStage = (id: string, patch: Partial<StageDraft>) =>
        setStages((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))

    const submit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()

        create.mutate(
            {
                name,
                current,
                stages: stages
                    .filter((stage) => stage.title && stage.start && stage.end)
                    .map((stage) => ({
                        id: stage.id,
                        title: stage.title,
                        start: toIso(stage.start),
                        end: toIso(stage.end),
                    })),
            },
            {
                onSuccess: () => {
                    setName("")
                    setCurrent(false)
                    setStages([])
                },
            }
        )
    }

    return (
        <form onSubmit={submit}>
            <FieldGroup>
                <h2 className="font-medium">New season</h2>
                <FieldDescription>
                    Rounds, format, and placement tiers are inherited from the tournament.
                </FieldDescription>

                <Field>
                    <FieldLabel htmlFor="season-name">Name</FieldLabel>
                    <Input
                        id="season-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="2026 Season"
                        required
                    />
                </Field>

                <Field>
                    <FieldLabel htmlFor="season-current">Make current</FieldLabel>
                    <input
                        id="season-current"
                        type="checkbox"
                        checked={current}
                        onChange={(e) => setCurrent(e.target.checked)}
                    />
                    <FieldDescription>
                        Only one season per tournament can be current.
                    </FieldDescription>
                </Field>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Stages</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setStages((rows) => [...rows, emptyStage()])}
                        >
                            Add stage
                        </Button>
                    </div>

                    {stages.length === 0 && (
                        <FieldDescription>No stages yet.</FieldDescription>
                    )}

                    {stages.map((stage, index) => (
                        <div key={stage.id} className="flex flex-wrap items-end gap-2">
                            <Input
                                aria-label={`Stage ${index + 1} title`}
                                className="max-w-48"
                                placeholder="Group stage"
                                value={stage.title}
                                onChange={(e) => updateStage(stage.id, { title: e.target.value })}
                            />
                            <Input
                                aria-label={`Stage ${index + 1} start`}
                                type="datetime-local"
                                value={stage.start}
                                onChange={(e) => updateStage(stage.id, { start: e.target.value })}
                            />
                            <Input
                                aria-label={`Stage ${index + 1} end`}
                                type="datetime-local"
                                value={stage.end}
                                onChange={(e) => updateStage(stage.id, { end: e.target.value })}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    setStages((rows) => rows.filter((row) => row.id !== stage.id))
                                }
                            >
                                Remove
                            </Button>
                        </div>
                    ))}
                </div>

                {create.isError && (
                    <FieldError>
                        {create.error instanceof Error ? create.error.message : "Could not create the season."}
                    </FieldError>
                )}

                <Field>
                    <Button type="submit" disabled={create.isPending}>
                        {create.isPending ? "Creating…" : "Create season"}
                    </Button>
                </Field>
            </FieldGroup>
        </form>
    )
}

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
            {data && data.items.length > 0 && <SeasonsTable tournamentId={tournamentId} seasons={data.items} />}
            <Separator />
            <NewSeasonForm tournamentId={tournamentId} />
        </div>
    )
}