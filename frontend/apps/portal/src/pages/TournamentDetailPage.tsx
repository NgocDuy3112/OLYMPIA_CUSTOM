import { useState, type SubmitEvent } from "react"
import { Link, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { Separator } from "@shared/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { CalendarDays } from "lucide-react"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@shared/ui/card"
import { EmptyState, ListSkeleton } from "@/components/page"
import { useSeasons } from "@/lib/seasons"
import { useMe } from "@/lib/session"
import {
    useTournament,
    useUpdateTournament,
    type TournamentDetail,
    type TournamentUpdate,
} from "@/lib/tournaments"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

function ReadOnly({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase">{label}</dt>
            <dd className="text-sm">{children}</dd>
        </div>
    )
}

function TournamentForm({ tournament }: { tournament: TournamentDetail }) {
    const { data: me } = useMe()
    const update = useUpdateTournament(tournament.id)

    const isAdmin = me?.role === "ADMIN"

    const [name, setName] = useState(tournament.name)
    const [slug, setSlug] = useState(tournament.slug)
    const [visibility, setVisibility] = useState(tournament.visibility)
    const [tags, setTags] = useState(tournament.defaultTags.join(", "))

    const submit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()

        const patch: TournamentUpdate = { name, slug }
        if (isAdmin) patch.visibility = visibility
        patch.defaultTags = tags.split(",").map((tag) => tag.trim()).filter(Boolean)

        update.mutate(patch)
    }

    const status = update.isPending
        ? "Saving…"
        : update.isError
            ? update.error instanceof Error
                ? update.error.message
                : "Could not save."
            : update.isSuccess
                ? "Saved."
                : "\u00a0"

    return (
        <Card>
            <CardContent>
                <form id="tournament-details" onSubmit={submit}>
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="name">Name</FieldLabel>
                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="slug">Slug</FieldLabel>
                            <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
                            <FieldDescription>Used in public URLs. Must be unique.</FieldDescription>
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="visibility">Visibility</FieldLabel>
                            {isAdmin ? (
                                <select
                                    id="visibility"
                                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                    value={visibility}
                                    onChange={(e) => setVisibility(e.target.value as "PUBLIC" | "PRIVATE")}
                                >
                                    <option value="PUBLIC">Public</option>
                                    <option value="PRIVATE">Private</option>
                                </select>
                            ) : (
                                <>
                                    <p className="text-sm">
                                        <Badge variant="outline">{tournament.visibility}</Badge>
                                    </p>
                                    <FieldDescription>Only an admin can change visibility.</FieldDescription>
                                </>
                            )}
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="tags">Tags</FieldLabel>
                            <Input
                                id="tags"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="THTH, GDTT"
                            />
                            <FieldDescription>Comma-separated. At least one is required.</FieldDescription>
                        </Field>
                    </FieldGroup>
                </form>
            </CardContent>

            <CardFooter className="justify-between gap-4">
                <p className={`text-sm ${update.isError ? "text-destructive" : "text-muted-foreground"}`}>
                    {status}
                </p>
                <Button type="submit" form="tournament-details" size="sm" disabled={update.isPending}>
                    Save changes
                </Button>
            </CardFooter>
        </Card>
    )
}

export function TournamentDetailPage() {
    const { id = "" } = useParams<{ id: string }>()
    const { data, error, isPending, isError } = useTournament(id)
    const seasons = useSeasons(id)

    if (isPending) {
        return <p className="p-6 text-sm text-muted-foreground">Loading tournament…</p>
    }

    if (isError || !data) {
        return (
            <div className="flex flex-col gap-4 p-6">
                <p role="alert" className="text-sm text-destructive">
                    {error instanceof Error ? error.message : "Could not load this tournament."}
                </p>
                <Link className="text-sm underline underline-offset-2" to="/">
                    Back to tournaments
                </Link>
            </div>
        )
    }

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
            <div className="flex flex-col gap-1">
                <Link className="text-sm text-muted-foreground underline underline-offset-2" to="/">
                    ← Tournaments
                </Link>
                <h1 className="text-2xl font-bold">{data.name}</h1>
                <p className="font-mono text-xs text-muted-foreground">{data.slug}</p>
                <Link
                    className="mt-2 w-fit text-sm underline underline-offset-2"
                    to={`/tournaments/${data.id}/seasons`}
                >
                    Seasons →
                </Link>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
                <section className="flex flex-col gap-4">
                    <h2 className="font-medium">Details</h2>
                    <TournamentForm tournament={data} />
                </section>

                <section className="flex flex-col gap-6">
                    <h2 className="font-medium">Configuration</h2>

                    <dl className="grid grid-cols-2 gap-4">
                        <ReadOnly label="Created">{dateFormat.format(new Date(data.createdAt))}</ReadOnly>
                        <ReadOnly label="Updated">{dateFormat.format(new Date(data.updatedAt))}</ReadOnly>
                        <ReadOnly label="Competitors per match">
                            {data.defaultFormat.competitorsPerMatch}
                        </ReadOnly>
                        <ReadOnly label="Seat kinds">
                            {data.defaultFormat.allowedSeatKinds.join(", ") || "—"}
                        </ReadOnly>
                        <ReadOnly label="Team size">{data.defaultFormat.teamSize ?? "—"}</ReadOnly>
                        <ReadOnly label="Team scoring">
                            {data.defaultFormat.teamAggregation ?? "—"}
                        </ReadOnly>
                    </dl>

                    <Separator />

                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium">Rounds</h3>
                        <ol className="flex flex-col gap-1 text-sm">
                            {[...data.defaultRounds]
                                .sort((a, b) => a.order - b.order)
                                .map((round) => (
                                    <li key={round.id} className="flex justify-between gap-4">
                                        <span>{round.name}</span>
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {round.id}
                                        </span>
                                    </li>
                                ))}
                        </ol>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium">Placement tiers</h3>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Place</TableHead>
                                    <TableHead>Points</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.defaultPlacementTiers.map((tier) => (
                                    <TableRow key={`${tier.min}-${tier.max}`}>
                                        <TableCell>
                                            {tier.min === tier.max ? tier.min : `${tier.min}–${tier.max}`}
                                        </TableCell>
                                        <TableCell>{tier.points}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </section>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Seasons</CardTitle>
                    <CardDescription>
                        Each season inherits this tournament&rsquo;s format, tiers and progression when created.
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-0">
                    {seasons.isPending ? (
                        <ListSkeleton rows={3} />
                    ) : (seasons.data?.items.length ?? 0) === 0 ? (
                        <EmptyState
                            icon={CalendarDays}
                            title="No seasons yet"
                            description="A season is one run of this tournament: its rounds, players and matches."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Rounds</TableHead>
                                    <TableHead>Stages</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {seasons.data!.items.map((season) => (
                                    <TableRow key={season.id}>
                                        <TableCell className="font-medium">
                                            <Link
                                                className="underline-offset-2 hover:underline"
                                                to={`/tournaments/${data.id}/seasons/${season.id}`}
                                            >
                                                {season.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{season.rounds.length}</TableCell>
                                        <TableCell>{season.stages.length}</TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                {season.current && <Badge>Current</Badge>}
                                                {season.closedAt && (
                                                    <Badge variant="secondary">Closed</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {dateFormat.format(new Date(season.createdAt))}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}