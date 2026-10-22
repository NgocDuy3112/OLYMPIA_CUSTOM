import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useUpdateSeason, type RoundConfig, type SeasonDetail } from "@/lib/season"
import { draftFrom, KINDS_LIST, questionCountOf, type Kind } from "@/lib/rules"

// The season's rulebook, edited in a dialog. The read surface behind it stays a table
// of text: one job per surface, one commit point per change.
export function SeasonRulesDialog({
    tournamentId,
    seasonId,
    season,
    frozen,
    open,
    onOpenChange,
}: {
    tournamentId: string
    seasonId: string
    season: SeasonDetail
    frozen: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const update = useUpdateSeason(tournamentId, seasonId)

    // The dialog is mounted when it opens, so the draft is derived from the server on
    // every opening: a previous draft can never show up again.
    const [draft, setDraft] = useState(() => draftFrom(season))

    const rounds = [...season.rounds].sort((a, b) => a.order - b.order)
    const saved = draftFrom(season)
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
    const total = Object.values(draft).reduce((sum, config) => sum + questionCountOf(config), 0)

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

    const save = () =>
        update.mutate({ roundRules: draft }, { onSuccess: () => onOpenChange(false) })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>Round rules</DialogTitle>
                        <DialogDescription>
                            What every match of this season plays. Only the fields the engine
                            honours are editable.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[60vh] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Round</TableHead>
                                    <TableHead>Turn</TableHead>
                                    <TableHead>Allowed kinds</TableHead>
                                    <TableHead className="w-28">Points</TableHead>
                                    <TableHead className="w-28 text-right">Questions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rounds.flatMap((round) => {
                                    const config = draft[round.id]
                                    // Narrow once, keep the value: `config.scoring` is a union,
                                    // and repeating the index access loses the narrowing.
                                    const constantPoints =
                                        config.scoring.template === "constant" ? config.scoring.points : null

                                    return config.turns.map((turn, turnIndex) => (
                                        <TableRow key={`${round.id}-${turn.id}`}>
                                            <TableCell className="align-top">
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
                                                <div className="flex gap-3">
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
                                                </div>
                                            </TableCell>

                                            <TableCell className="align-top">
                                                {constantPoints !== null ? (
                                                    <Input
                                                        type="number"
                                                        className="h-8 w-20"
                                                        value={constantPoints}
                                                        onChange={(event) =>
                                                            setPoints(round.id, Number(event.target.value))
                                                        }
                                                    />
                                                ) : (
                                                    <span className="text-xs">from {config.scoring.template}</span>
                                                )}
                                            </TableCell>

                                            <TableCell className="text-right align-top">
                                                <Input
                                                    type="number"
                                                    className="ml-auto h-8 w-20 text-right"
                                                    value={turn.questionCount ?? 0}
                                                    onChange={(event) =>
                                                        setQuestions(round.id, turnIndex, Number(event.target.value))
                                                    }
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                })}
                            </TableBody>
                        </Table>
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
