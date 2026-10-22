import { useState } from "react"
import { Check, Pencil } from "lucide-react"
import { Button } from "@shared/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@shared/ui/card"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useUpdateSeason, type RoundConfig, type SeasonDetail } from "@/lib/season"

const KINDS = ["MC", "TEXT", "KEYWORD"] as const
type Kind = (typeof KINDS)[number]

function emptyConfig(): RoundConfig {
    return {
        allowedKinds: ["MC"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 0 }],
    }
}

// The rules a season holds, or the template for one it doesn't have yet.
function draftFrom(season: SeasonDetail): Record<string, RoundConfig> {
    return Object.fromEntries(
        season.rounds.map((round) => [round.id, season.roundRules?.[round.id] ?? emptyConfig()])
    )
}

const questionCountOf = (config: RoundConfig) =>
    config.turns.reduce((sum, turn) => sum + (turn.questionCount ?? 0), 0)

const kindsLabel = (config: RoundConfig) =>
    config.allowedKinds.length === 0 ? "none" : config.allowedKinds.join(" · ")

const pointsLabel = (config: RoundConfig) =>
    config.scoring.template === "constant" ? `${config.scoring.points} pts` : `from ${config.scoring.template}`

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
    const update = useUpdateSeason(tournamentId, seasonId)

    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(() => draftFrom(season))

    const rounds = [...season.rounds].sort((a, b) => a.order - b.order)
    const shown = editing ? draft : draftFrom(season)

    const total = Object.values(shown).reduce((sum, config) => sum + questionCountOf(config), 0)
    const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(season))

    const patch = (roundId: string, change: (config: RoundConfig) => RoundConfig) =>
        setDraft((current) => ({ ...current, [roundId]: change(current[roundId]) }))

    const toggleKind = (roundId: string, kind: Kind) =>
        patch(roundId, (config) => ({
            ...config,
            allowedKinds: config.allowedKinds.includes(kind)
                ? config.allowedKinds.filter((item) => item !== kind)
                : [...config.allowedKinds, kind],
        }))

    const setPoints = (roundId: string, points: number) =>
        patch(roundId, (config) => ({ ...config, scoring: { template: "constant", points } }))

    const setQuestions = (roundId: string, index: number, questionCount: number) =>
        patch(roundId, (config) => ({
            ...config,
            turns: config.turns.map((turn, turnIndex) =>
                turnIndex === index ? { ...turn, questionCount } : turn
            ),
        }))

    const startEditing = () => {
        setDraft(draftFrom(season))
        setEditing(true)
    }

    const cancel = () => {
        setDraft(draftFrom(season))
        setEditing(false)
    }

    const save = () =>
        update.mutate({ roundRules: draft }, { onSuccess: () => setEditing(false) })

    return (
        <Card className="[--card-spacing:--spacing(6)]">
            <CardHeader>
                <CardTitle className="text-base">Round rules</CardTitle>
                <CardDescription>
                    What every drawn match plays. Only the fields the engine honours are editable.
                </CardDescription>
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
                            // Narrow once, keep the value: `config.scoring` is a union, and
                            // repeating the index access loses the narrowing.
                            const constantPoints =
                                config.scoring.template === "constant" ? config.scoring.points : null

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
                                        {editing ? (
                                            <div className="flex gap-3">
                                                {KINDS.map((kind) => (
                                                    <label key={kind} className="flex items-center gap-1.5 text-xs">
                                                        <input
                                                            type="checkbox"
                                                            className="size-3.5 rounded border-input"
                                                            checked={config.allowedKinds.includes(kind)}
                                                            disabled={frozen}
                                                            onChange={() => toggleKind(round.id, kind)}
                                                        />
                                                        {kind}
                                                    </label>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs">{kindsLabel(config)}</span>
                                        )}
                                    </TableCell>

                                    <TableCell className="align-top">
                                        {editing && constantPoints !== null ? (
                                            <Input
                                                type="number"
                                                className="h-8 w-20"
                                                value={constantPoints}
                                                disabled={frozen}
                                                onChange={(event) =>
                                                    setPoints(round.id, Number(event.target.value))
                                                }
                                            />
                                        ) : (
                                            <span className="text-xs">{pointsLabel(config)}</span>
                                        )}
                                    </TableCell>

                                    <TableCell className="pr-6 text-right align-top">
                                        {editing ? (
                                            <Input
                                                type="number"
                                                className="ml-auto h-8 w-20 text-right"
                                                value={turn.questionCount ?? 0}
                                                disabled={frozen}
                                                onChange={(event) =>
                                                    setQuestions(round.id, turnIndex, Number(event.target.value))
                                                }
                                            />
                                        ) : (
                                            <span className="text-xs tabular-nums">
                                                {turn.questionCount ?? 0}
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        })}
                    </TableBody>
                </Table>
            </CardContent>

            <CardFooter className="justify-between gap-4 border-t">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <>
                        <Check className="size-4 text-emerald-600" />
                        {total} questions per match
                    </>
                </p>

                {editing ? (
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={cancel} disabled={update.isPending}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={save}
                            disabled={frozen || !dirty || update.isPending}
                        >
                            {update.isPending ? "Saving…" : "Save rules"}
                        </Button>
                    </div>
                ) : (
                    <Button size="sm" variant="outline" onClick={startEditing} disabled={frozen}>
                        <Pencil className="size-3.5" />
                        Edit
                    </Button>
                )}
            </CardFooter>

            {update.isError && (
                <p className="px-6 pb-4 text-sm text-destructive">{update.error.message}</p>
            )}
            {frozen && (
                <p className="px-6 pb-4 text-sm text-muted-foreground">
                    Frozen: qualification has already started for this season.
                </p>
            )}
        </Card>
    )
}