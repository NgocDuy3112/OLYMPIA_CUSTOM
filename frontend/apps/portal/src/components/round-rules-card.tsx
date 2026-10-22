import { useState } from "react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@shared/ui/card"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useUpdateSeason, type RoundConfig, type SeasonDetail } from "@/lib/season"
import type { SeasonRound } from "@/lib/tournaments"

const KINDS = ["MC", "TEXT", "KEYWORD"] as const
type Kind = (typeof KINDS)[number]

// What a drawn match needs at minimum: one turn that declares how many questions it eats.
function defaultConfig(): RoundConfig {
    return {
        allowedKinds: ["MC"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 0 }],
    }
}

export function RoundRulesCard({
    tournamentId,
    seasonId,
    season,
    round,
    disabled,
}: {
    tournamentId: string
    seasonId: string
    season: SeasonDetail
    round: SeasonRound
    disabled: boolean
}) {
    const saved = season.roundRules?.[round.id] ?? defaultConfig()
    const update = useUpdateSeason(tournamentId, seasonId)

    const constantScoring = saved.scoring.template === "constant" ? saved.scoring : null

    const [kinds, setKinds] = useState<Kind[]>(saved.allowedKinds)
    const [points, setPoints] = useState(constantScoring?.points ?? 10)
    const [counts, setCounts] = useState<Record<string, number>>(
        Object.fromEntries(saved.turns.map((turn) => [turn.id, turn.questionCount ?? 0]))
    )

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    const dirty =
        kinds.join(",") !== saved.allowedKinds.join(",") ||
        (constantScoring !== null && points !== constantScoring.points) ||
        saved.turns.some((turn) => (turn.questionCount ?? 0) !== (counts[turn.id] ?? 0))

    const toggle = (kind: Kind) =>
        setKinds((current) =>
            current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]
        )

    const save = () => {
        const config: RoundConfig = {
            ...saved,
            allowedKinds: kinds,
            scoring: constantScoring ? { template: "constant", points } : saved.scoring,
            turns: saved.turns.map((turn) => ({
                ...turn,
                questionCount: counts[turn.id] ?? 0,
            })),
        }

        update.mutate({ roundRules: { ...(season.roundRules ?? {}), [round.id]: config } })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    {round.name}
                    <Badge variant="outline" className="font-mono text-xs">
                        {round.id}
                    </Badge>
                </CardTitle>
                <CardDescription>
                    {total === 0
                        ? "No questions declared — a draw cannot fill this round."
                        : `${total} question${total === 1 ? "" : "s"} across ${saved.turns.length} turn${saved.turns.length === 1 ? "" : "s"}.`}
                </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                        Allowed kinds
                    </p>
                    <div className="flex flex-wrap gap-4">
                        {KINDS.map((kind) => (
                            <label key={kind} className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-input"
                                    checked={kinds.includes(kind)}
                                    disabled={disabled}
                                    onChange={() => toggle(kind)}
                                />
                                {kind}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                        Points per question
                    </p>
                    {constantScoring ? (
                        <Input
                            type="number"
                            min={0}
                            className="w-28"
                            value={points}
                            disabled={disabled}
                            onChange={(event) => setPoints(Number(event.target.value))}
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Points come from the {saved.scoring.template} rule.
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                        Questions per turn
                    </p>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Turn</TableHead>
                                <TableHead>Mode</TableHead>
                                <TableHead>Delivery</TableHead>
                                <TableHead className="w-28 text-right">Questions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {saved.turns.map((turn) => (
                                <TableRow key={turn.id}>
                                    <TableCell className="font-mono text-xs">{turn.id}</TableCell>
                                    <TableCell>{turn.mode}</TableCell>
                                    <TableCell>{turn.delivery}</TableCell>
                                    <TableCell className="text-right">
                                        <Input
                                            type="number"
                                            min={0}
                                            className="ml-auto w-20 text-right"
                                            value={counts[turn.id] ?? 0}
                                            disabled={disabled}
                                            onChange={(event) =>
                                                setCounts((current) => ({
                                                    ...current,
                                                    [turn.id]: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

            <CardFooter className="justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                    {disabled
                        ? "Frozen: qualification has started."
                        : update.isPending
                            ? "Saving…"
                            : update.isError
                                ? update.error.message
                                : update.isSuccess
                                    ? "Saved."
                                    : "\u00a0"}
                </p>
                <Button
                    size="sm"
                    disabled={disabled || !dirty || kinds.length === 0 || update.isPending}
                    onClick={save}
                >
                    Save rules
                </Button>
            </CardFooter>
        </Card>
    )
}