import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { useUpdateTournament, type RoundConfig, type ScoringRule, type TournamentDetail } from "@/lib/tournament"
import {
    configsFor,
    emptyConfig,
    hasRound,
    KINDS_LIST,
    KNOWN_ROUNDS,
    moveRound,
    questionCountOf,
    toggleRound,
    type Kind
} from "@/lib/rules"
import type { TournamentRound } from "@/lib/tournaments"

// The scoring templates the engine understands, and the numbers each one carries.
const TEMPLATES: Array<{ value: ScoringRule["template"]; label: string }> = [
    { value: "constant", label: "Flat points" },
    { value: "keyword_derived", label: "Keyword value" },
    { value: "rank_multiplier", label: "Speed bands" },
    { value: "outcome_multipliers", label: "Percentages and powers" }
]

// The default of a template, used when the round switches to it.
function defaultScoring(template: ScoringRule["template"]): ScoringRule {
    switch (template) {
        case "constant":
            return { template: "constant", points: 10 }
        case "keyword_derived":
            return { template: "keyword_derived", initial: 100, dropPerHint: 10, floor: 20, incorrect: 0 }
        case "rank_multiplier":
            return {
                template: "rank_multiplier",
                bands: [{ untilSec: 5, points: 15 }, { untilSec: 15, points: 10 }, { untilSec: 30, points: 5 }],
                multipliers: [4, 3, 2],
                ladderTop: 10,
                incorrect: 0,
                timeBasis: "first"
            }
        case "outcome_multipliers":
            return {
                template: "outcome_multipliers",
                correct: 1,
                incorrect: -0.5,
                powers: { star: { correct: 1.5, incorrect: -1 } }
            }
    }
}

const num = (value: string) => (value === "" ? 0 : Number(value))

// The tournament's rulebook, edited in a dialog. The read surface behind it stays a table
// of text: one job per surface, one commit point per change.
export function TournamentRulesDialog({
    tournamentId,
    tournament,
    frozen,
    open,
    onOpenChange,
}: {
    tournamentId: string
    tournament: TournamentDetail
    frozen: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const update = useUpdateTournament(tournamentId)

    // The dialog is mounted when it opens, so the drafts are derived from the
    // server on every opening: a previous draft can never show up again.
    //
    // TWO drafts, because a tournament has two editable things: the LIST of rounds
    // it plays (which the engine reads for order) and each round's rules. Adding a
    // round is the only way a fresh tournament becomes playable at all.
    const [rounds, setRounds] = useState<TournamentRound[]>(() =>
        [...tournament.rounds].sort((a, b) => a.order - b.order)
    )
    const [draft, setDraft] = useState(() => configsFor(tournament.rounds, tournament.roundRules))

    const savedRounds = [...tournament.rounds].sort((a, b) => a.order - b.order)
    const saved = configsFor(savedRounds, tournament.roundRules)
    // The configs of rounds that were just removed are dropped on save, so the
    // payload always matches the list (no orphan rules on the server).
    const configs = configsFor(rounds, draft)
    const dirty =
        JSON.stringify(rounds.map((round) => round.id)) !== JSON.stringify(savedRounds.map((round) => round.id)) ||
        JSON.stringify(configs) !== JSON.stringify(saved)

    const toggle = (id: string, name: string) => setRounds((list) => toggleRound(list, id, name))
    const move = (id: string, direction: -1 | 1) => setRounds((list) => moveRound(list, id, direction))
    const total = Object.values(configs).reduce((sum, config) => sum + questionCountOf(config), 0)

    // A round that was just checked has no draft yet — it falls back to the
    // template, otherwise the section below would read `undefined.scoring` and
    // blank the whole app.
    const patch = (roundId: string, change: (config: RoundConfig) => RoundConfig) =>
        setDraft((current) => ({
            ...current,
            [roundId]: change(current[roundId] ?? configs[roundId] ?? emptyConfig())
        }))

    const toggleKind = (roundId: string, kind: Kind) =>
        patch(roundId, (config) => ({
            ...config,
            allowedKinds: config.allowedKinds.includes(kind)
                ? config.allowedKinds.filter((item) => item !== kind)
                : [...config.allowedKinds, kind],
        }))

    const setScoring = (roundId: string, scoring: ScoringRule) =>
        patch(roundId, (config) => ({ ...config, scoring }))

    const setTurn = (roundId: string, index: number, change: Record<string, unknown>) =>
        patch(roundId, (config) => ({
            ...config,
            turns: config.turns.map((turn, turnIndex) =>
                turnIndex === index ? { ...turn, ...change } : turn
            ),
        }))

    const save = () =>
        update.mutate({ rounds, roundRules: configs }, { onSuccess: () => onOpenChange(false) })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>Round rules</DialogTitle>
                        <DialogDescription>
                            What every match of this tournament plays: the questions each turn
                            draws, the clocks, and how the points are scored.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto">
                        {/* The LIST first: which rounds this tournament plays. Only
                            rounds the deck has a module for are offered — a typo'd id
                            would create a round the console cannot draw. */}
                        <section className="flex flex-col gap-2">
                            <span className="text-sm font-medium">Rounds this tournament plays</span>
                            <p className="text-xs text-muted-foreground">
                                Order is the playing order; the console opens on the first one.
                            </p>
                            <div className="flex flex-col gap-1.5">
                                {KNOWN_ROUNDS.map((known) => {
                                    const picked = hasRound(rounds, known.id)
                                    const seat = rounds.findIndex((round) => round.id === known.id)
                                    return (
                                        <label key={known.id} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                className="size-3.5 rounded border-input"
                                                checked={picked}
                                                onChange={() => toggle(known.id, known.name)}
                                            />
                                            <span>{known.name}</span>
                                            <span className="font-mono text-xs text-muted-foreground">{known.id}</span>
                                            {picked ? (
                                                <span className="ml-auto flex items-center gap-1">
                                                    <span className="text-xs tabular-nums text-muted-foreground">
                                                        #{seat + 1}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={seat === 0}
                                                        onClick={() => move(known.id, -1)}
                                                        title="Move up"
                                                    >
                                                        ↑
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={seat === rounds.length - 1}
                                                        onClick={() => move(known.id, 1)}
                                                        title="Move down"
                                                    >
                                                        ↓
                                                    </Button>
                                                </span>
                                            ) : null}
                                        </label>
                                    )
                                })}
                            </div>
                            {rounds.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    No rounds yet — a tournament without rounds has nothing for a match to play.
                                </p>
                            ) : null}
                        </section>

                        {rounds.map((round) => {
                            const config = configs[round.id]
                            // Narrow once, keep the value: `config.scoring` is a union, and
                            // the narrowing does not survive into the closures below.
                            const scoring = config.scoring
                            const constant = scoring.template === "constant" ? scoring : null
                            const keyword = scoring.template === "keyword_derived" ? scoring : null
                            const sprint = scoring.template === "rank_multiplier" ? scoring : null
                            const main = scoring.template === "outcome_multipliers" ? scoring : null
                            return (
                                <section key={round.id} className="flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="font-medium">{round.name}</span>
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {round.id}
                                        </span>
                                        <span className="flex gap-3">
                                            {KINDS_LIST.map((kind) => (
                                                <label key={kind} className="flex items-center gap-1.5 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        className="size-3.5 rounded border-input"
                                                        checked={config.allowedKinds.includes(kind)}
                                                        onChange={() => toggleKind(round.id, kind)}
                                                    />
                                                    {kind}
                                                </label>
                                            ))}
                                        </span>
                                    </div>

                                    {/* The scoring: the template and the numbers it carries. */}
                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                        <label className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">Scoring</span>
                                            <select
                                                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                                                value={config.scoring.template}
                                                onChange={(event) =>
                                                    setScoring(
                                                        round.id,
                                                        defaultScoring(event.target.value as ScoringRule["template"])
                                                    )
                                                }
                                            >
                                                {TEMPLATES.map((template) => (
                                                    <option key={template.value} value={template.value}>
                                                        {template.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        {constant !== null && (
                                            <label className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">points</span>
                                                <Input
                                                    type="number"
                                                    className="h-8 w-20"
                                                    value={constant.points}
                                                    onChange={(event) =>
                                                        setScoring(round.id, {
                                                            template: "constant",
                                                            points: num(event.target.value)
                                                        })
                                                    }
                                                />
                                            </label>
                                        )}

                                        {keyword !== null && (
                                            <>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">starts at</span>
                                                    <Input
                                                        type="number"
                                                        className="h-8 w-20"
                                                        value={keyword.initial}
                                                        onChange={(event) =>
                                                            setScoring(round.id, {
                                                                ...scoring,
                                                                initial: num(event.target.value)
                                                            } as ScoringRule)
                                                        }
                                                    />
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">− per hint</span>
                                                    <Input
                                                        type="number"
                                                        className="h-8 w-20"
                                                        value={keyword.dropPerHint}
                                                        onChange={(event) =>
                                                            setScoring(round.id, {
                                                                ...scoring,
                                                                dropPerHint: num(event.target.value)
                                                            } as ScoringRule)
                                                        }
                                                    />
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">floor</span>
                                                    <Input
                                                        type="number"
                                                        className="h-8 w-20"
                                                        value={keyword.floor ?? 20}
                                                        onChange={(event) =>
                                                            setScoring(round.id, {
                                                                ...scoring,
                                                                floor: num(event.target.value)
                                                            } as ScoringRule)
                                                        }
                                                    />
                                                </label>
                                            </>
                                        )}

                                        {sprint !== null && (
                                            <>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">bands</span>
                                                    <Input
                                                        className="h-8 w-56 font-mono text-xs"
                                                        value={JSON.stringify(sprint.bands)}
                                                        onChange={(event) => {
                                                            try {
                                                                const bands = JSON.parse(event.target.value)
                                                                if (Array.isArray(bands)) {
                                                                    setScoring(round.id, {
                                                                        ...scoring,
                                                                        bands
                                                                    } as ScoringRule)
                                                                }
                                                            } catch {
                                                                // Half-typed JSON: leave the last good value.
                                                            }
                                                        }}
                                                    />
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">× by order</span>
                                                    <Input
                                                        className="h-8 w-28 font-mono text-xs"
                                                        value={(sprint.multipliers ?? []).join(", ")}
                                                        onChange={(event) => {
                                                            const multipliers = event.target.value
                                                                .split(",")
                                                                .map((part) => num(part.trim()))
                                                                .filter((value) => !Number.isNaN(value))
                                                            setScoring(round.id, {
                                                                ...scoring,
                                                                multipliers
                                                            } as ScoringRule)
                                                        }}
                                                    />
                                                </label>
                                            </>
                                        )}

                                        {main !== null && (
                                            <>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">correct</span>
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        className="h-8 w-20"
                                                        value={main.correct}
                                                        onChange={(event) =>
                                                            setScoring(round.id, {
                                                                ...scoring,
                                                                correct: num(event.target.value)
                                                            } as ScoringRule)
                                                        }
                                                    />
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">wrong</span>
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        className="h-8 w-20"
                                                        value={main.incorrect}
                                                        onChange={(event) =>
                                                            setScoring(round.id, {
                                                                ...scoring,
                                                                incorrect: num(event.target.value)
                                                            } as ScoringRule)
                                                        }
                                                    />
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">STAR</span>
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        className="h-8 w-20"
                                                        value={main.powers.star.correct}
                                                        onChange={(event) =>
                                                            setScoring(round.id, {
                                                                ...scoring,
                                                                powers: {
                                                                    star: {
                                                                        ...main.powers.star,
                                                                        correct: num(event.target.value)
                                                                    }
                                                                }
                                                            } as ScoringRule)
                                                        }
                                                    />
                                                </label>
                                            </>
                                        )}
                                    </div>

                                    {/* The turns: the questions and the clocks. */}
                                    <div className="flex flex-col gap-2">
                                        {config.turns.map((turn, turnIndex) => (
                                            <div key={turn.id} className="flex flex-wrap items-center gap-3 text-sm">
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {turn.id}
                                                </span>

                                                <label className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">questions</span>
                                                    <Input
                                                        type="number"
                                                        className="h-8 w-20"
                                                        value={turn.questionCount ?? 0}
                                                        onChange={(event) =>
                                                            setTurn(round.id, turnIndex, {
                                                                questionCount: num(event.target.value)
                                                            })
                                                        }
                                                    />
                                                </label>

                                                {turn.timeBudgetSeconds !== undefined && (
                                                    <label className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">budget s</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8 w-20"
                                                            value={turn.timeBudgetSeconds}
                                                            onChange={(event) =>
                                                                setTurn(round.id, turnIndex, {
                                                                    timeBudgetSeconds: num(event.target.value)
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                )}

                                                {turn.timeLimitSeconds !== undefined && (
                                                    <label className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">limit s</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8 w-20"
                                                            value={turn.timeLimitSeconds}
                                                            onChange={(event) =>
                                                                setTurn(round.id, turnIndex, {
                                                                    timeLimitSeconds: num(event.target.value)
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                )}

                                                {turn.buzzWindowSeconds !== undefined && (
                                                    <label className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">buzz s</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8 w-20"
                                                            value={turn.buzzWindowSeconds}
                                                            onChange={(event) =>
                                                                setTurn(round.id, turnIndex, {
                                                                    buzzWindowSeconds: num(event.target.value)
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                )}

                                                {turn.pickCount !== undefined && (
                                                    <label className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">picks</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8 w-20"
                                                            value={turn.pickCount}
                                                            onChange={(event) =>
                                                                setTurn(round.id, turnIndex, {
                                                                    pickCount: num(event.target.value)
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                )}

                                                {turn.hintCount !== undefined && (
                                                    <label className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">hints</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8 w-20"
                                                            value={turn.hintCount}
                                                            onChange={(event) =>
                                                                setTurn(round.id, turnIndex, {
                                                                    hintCount: num(event.target.value)
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )
                        })}
                    </div>

                    {/* The invariant, and why Save is greyed out. */}
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        {total} questions per match
                        {!dirty && !update.isPending && (
                            <span className="text-muted-foreground">· no changes to save</span>
                        )}
                    </p>

                    {update.isError && (
                        <p role="alert" className="text-sm text-destructive">{update.error.message}</p>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={update.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={save}
                            disabled={frozen || !dirty || update.isPending}
                        >
                            {update.isPending ? "Saving…" : "Save rules"}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
