import { useState, type ReactNode } from "react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import { useEnrolled, useSetMatchResults, useTransitionMatch } from "@/lib/tournament"
import type { MatchSummary } from "@/lib/tournament"

// A standard match's page section: its identity, its assembly state, its one
// operational transition (UPCOMING → LIVE), and result entry — all promoted off
// dialogs onto the match's own page (the recorded 2310 decision).
//
// No re-assembly button here on purpose: assembleMatch requires an explicit
// questions/autoPick payload (a pick UI), and the match's questions are frozen
// the moment it exists — surfacing a half-pick would risk the show's data.
// The page SHOWS the assembly state instead.

export function StandardMatchControl({
    tournamentId,
    match,
}: {
    tournamentId: string
    match: MatchSummary
}) {
    const enrolled = useEnrolled(tournamentId)
    const transition = useTransitionMatch(tournamentId)
    const save = useSetMatchResults(tournamentId)
    const [scores, setScores] = useState<Record<string, string>>({})

    const names = new Map(
        (enrolled.data?.items ?? []).map((row) => [row.userId, row.displayName])
    )
    const seated = match.players.flatMap((seat) => {
        const userId = "userId" in seat && seat.userId ? seat.userId : undefined
        const teamId = "teamId" in seat && seat.teamId ? seat.teamId : undefined
        const id = userId ?? teamId
        return id ? [{ id, seed: seat.seed }] : []
    })

    const transitionError = transition.isError ? transition.error.message : null
    const saveError = save.isError ? save.error.message : null

    const submitResults = () => {
        save.mutate({
            matchId: match.id,
            totals: seated.map((player) => ({
                userId: player.id,
                score: Number(scores[player.id] ?? 0),
            })),
        })
    }

    return (
        <div className="flex flex-col gap-6">
            {/* identity + assembly state */}
            <Section>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                    <Fact label="Status">
                        <Badge variant={match.status === "FINISHED" ? "secondary" : match.status === "LIVE" ? "destructive" : "outline"}>
                            {match.status}
                        </Badge>
                    </Fact>
                    <Fact label="Stage">{match.stageId}</Fact>
                    <Fact label="Slot">{match.slot ?? "—"}</Fact>
                    <Fact label="Scheduled">
                        {new Date(match.scheduledAt).toLocaleString("en-GB", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                        })}
                    </Fact>
                </dl>
                <p className="mt-3 text-sm text-muted-foreground">
                    {match.questions.length > 0
                        ? `${match.questions.length} questions assembled and frozen for this match.`
                        : "No questions yet — assemble happens at creation."}
                </p>
            </Section>

            {/* the transition: the first exposure of the status routes in the UI */}
            {match.status === "UPCOMING" && (
                <Section>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold">Ready to start?</p>
                            <p className="text-sm text-muted-foreground">
                                Starting moves the match to LIVE — the live socket opens for its
                                players. Entering the results finishes it.
                            </p>
                        </div>
                        <Button
                            onClick={() => transition.mutate({ matchId: match.id, status: "LIVE" })}
                            disabled={transition.isPending}
                        >
                            {transition.isPending ? "Starting…" : "Start match ▶"}
                        </Button>
                    </div>
                    {transitionError && (
                        <p role="alert" className="mt-3 text-sm text-destructive">{transitionError}</p>
                    )}
                </Section>
            )}

            {match.status === "LIVE" && (
                <Section>
                    <p className="text-sm text-muted-foreground">
                        <Badge variant="destructive" className="mr-2">LIVE</Badge>
                        Round play runs over the live socket. Entering the results below finishes
                        the match.
                    </p>
                </Section>
            )}

            {/* result entry — promoted from the MatchResultDialog */}
            {match.status !== "FINISHED" && (
                <Section>
                    <h2 className="mb-1 text-lg font-semibold">Enter result</h2>
                    <p className="mb-4 text-sm text-muted-foreground">
                        The totals each player finished with. Saving finishes the match and
                        feeds the standings.
                    </p>
                    <div className="flex flex-col gap-3">
                        {seated.map((player) => (
                            <label key={player.id} className="flex items-center gap-3 text-sm">
                                <span className="w-40 truncate">{names.get(player.id) ?? player.id}</span>
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    className="w-28"
                                    value={scores[player.id] ?? ""}
                                    placeholder="0"
                                    onChange={(event) =>
                                        setScores((state) => ({ ...state, [player.id]: event.target.value }))
                                    }
                                    aria-label={`Score for ${names.get(player.id) ?? player.id}`}
                                />
                            </label>
                        ))}
                    </div>
                    {saveError && <p role="alert" className="mt-3 text-sm text-destructive">{saveError}</p>}
                    <div className="mt-4 flex justify-end">
                        <Button onClick={submitResults} disabled={save.isPending || seated.length === 0}>
                            {save.isPending ? "Saving…" : "Save result & finish"}
                        </Button>
                    </div>
                </Section>
            )}

            {match.status === "FINISHED" && (
                <Section>
                    <p className="text-sm text-muted-foreground">
                        <Badge variant="secondary" className="mr-2">FINISHED</Badge>
                        The result is recorded — the standings and the bracket read it from here.
                    </p>
                </Section>
            )}
        </div>
    )
}

function Section({ children }: { children: ReactNode }) {
    return <section className="rounded-xl border bg-card p-5">{children}</section>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="font-medium">{children}</dd>
        </div>
    )
}
