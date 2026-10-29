import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "cn"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { api } from "@shared/lib/api"
import { useCreateMatch, useEnrolled } from "@/lib/tournament"
import type { AssemblyEntry, TournamentDetail } from "@/lib/tournament"

// The bank's published questions — the pool the picker draws from.
interface PoolQuestion {
    id: string
    kind: "MC" | "TEXT" | "KEYWORD" | "HINT"
    questionText: string
    status: string
}

interface PoolPage {
    items: PoolQuestion[]
    total: number
}

// One turn that asks for N questions — the picker must fill it before the
// match can be created (manual picks: nothing stages itself).
interface Slot {
    key: string
    roundId: string
    turnId: string
    label: string
    count: number
    kinds: Array<PoolQuestion["kind"]>
}

// A hand-placed match starts an hour out. Computed in the click handler —
// render stays pure (no Date.now in the component body).
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

// A match, placed by hand: the staff pick who plays whom AND which questions
// every turn plays — the match is born fully assembled.
export function NewMatchDialog({
    tournamentId,
    tournament,
    seats,
    open,
    onOpenChange,
}: {
    tournamentId: string
    tournament: TournamentDetail
    seats: number
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const enrolled = useEnrolled(tournamentId)
    const create = useCreateMatch(tournamentId)

    const stages = tournament.stages ?? []

    const [label, setLabel] = useState("")
    const [stageId, setStageId] = useState(stages[0]?.id ?? "")
    const [picked, setPicked] = useState<string[]>(Array.from({ length: seats }, () => ""))
    const [chosen, setChosen] = useState<Record<string, string[]>>({})
    const [search, setSearch] = useState("")

    // The pool: every published question (the first 100 — the bank is hand-sized).
    const pool = useQuery({
        queryKey: ["eligible-questions", tournamentId],
        queryFn: () =>
            api<PoolPage>(`/portal/tournaments/${tournamentId}/eligible-questions?limit=100`),
        enabled: open,
    })

    // The slots: every turn of the saved rules that declares questionCount.
    const rules = tournament.roundRules ?? {}
    const slots: Slot[] = []
    for (const round of [...tournament.rounds].sort((a, b) => a.order - b.order)) {
        const config = rules[round.id]
        if (!config) continue
        for (const turn of config.turns) {
            const count = turn.questionCount ?? 0
            if (count <= 0) continue
            slots.push({
                key: `${round.id}:${turn.id}`,
                roundId: round.id,
                turnId: turn.id,
                label: `${round.name} · ${turn.id}`,
                count,
                kinds: config.allowedKinds,
            })
        }
    }
    const questionsNeeded = slots.reduce((sum, slot) => sum + slot.count, 0)
    const questionsPicked = slots.reduce(
        (sum, slot) => sum + (chosen[slot.key]?.length ?? 0),
        0
    )
    const questionsComplete = slots.every(
        (slot) => (chosen[slot.key]?.length ?? 0) === slot.count
    )

    const players = enrolled.data?.items ?? []
    const chosenPlayers = picked.filter(Boolean)

    // One visible reason at a time — the disabled Create button states it here.
    const reason =
        label.trim().length === 0
            ? "Give the match a label"
            : stages.length === 0 || stageId.length === 0
              ? "Choose a stage"
              : chosenPlayers.length !== seats || new Set(chosenPlayers).size !== seats
                ? `Pick ${seats} distinct players`
                : !questionsComplete
                  ? `Questions: ${questionsPicked}/${questionsNeeded} picked`
                  : null
    const valid = reason === null

    const reset = () => {
        setLabel("")
        setPicked(Array.from({ length: seats }, () => ""))
        setChosen({})
        setSearch("")
    }

    const toggleQuestion = (slot: Slot, sourceId: string) =>
        setChosen((current) => {
            const list = current[slot.key] ?? []
            if (list.includes(sourceId)) {
                return { ...current, [slot.key]: list.filter((id) => id !== sourceId) }
            }
            if (list.length >= slot.count) return current
            return { ...current, [slot.key]: [...list, sourceId] }
        })

    const submit = () => {
        const questions: AssemblyEntry[] = slots.flatMap((slot) =>
            (chosen[slot.key] ?? []).map((sourceId) => ({
                roundId: slot.roundId,
                turnId: slot.turnId,
                sourceId,
            }))
        )
        const scheduledAt = inOneHour()
        create.mutate(
            { label: label.trim(), stageId, scheduledAt, playerIds: chosenPlayers, questions },
            { onSuccess: () => { reset(); onOpenChange(false) } }
        )
    }

    const error = create.isError ? create.error : null
    const pending = create.isPending

    const visibleFor = (slot: Slot): PoolQuestion[] => {
        const needle = search.trim().toLowerCase()
        return (pool.data?.items ?? []).filter(
            (question) =>
                slot.kinds.includes(question.kind) &&
                (needle.length === 0 || question.questionText.toLowerCase().includes(needle))
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>New match</DialogTitle>
                        <DialogDescription>
                            Pick {seats} players, then the questions each turn&apos;s rules ask for.
                        </DialogDescription>
                    </DialogHeader>

                    <label className="flex flex-col gap-2 text-sm">
                        Label
                        <Input
                            value={label}
                            placeholder="Match 1"
                            onChange={(event) => setLabel(event.target.value)}
                        />
                    </label>

                            <label className="flex flex-col gap-2 text-sm">
                                Stage
                                {stages.length === 0 ? (
                                    <span className="text-sm text-destructive">
                                        This tournament has no stages yet. Add them first — a match has
                                        to name one, and the stage order is what places the players.
                                    </span>
                                ) : (
                                    <select
                                        className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                        value={stageId}
                                        onChange={(event) => setStageId(event.target.value)}
                                    >
                                        {stages.map((stage, index) => (
                                            <option key={stage.id} value={stage.id}>
                                                {index + 1} · {stage.title}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </label>

                            <div className="flex flex-col gap-2">
                                {picked.map((value, seat) => (
                                    <select
                                        key={seat}
                                        className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                        value={value}
                                        onChange={(event) =>
                                            setPicked((current) =>
                                                current.map((item, index) =>
                                                    index === seat ? event.target.value : item
                                                )
                                            )
                                        }
                                    >
                                        <option value="">Seat {seat + 1} — choose a player…</option>
                                        {players.map((player) => (
                                            <option
                                                key={player.userId}
                                                value={player.userId}
                                                disabled={picked.includes(player.userId) && picked[seat] !== player.userId}
                                            >
                                                {player.displayName}
                                            </option>
                                        ))}
                                    </select>
                                ))}
                            </div>

                    {/* ── the assembly step: one section per turn the rules feed ── */}
                    {slots.length > 0 && (
                        <div className="flex flex-col gap-3 border-t pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium">
                                    Questions · {questionsPicked}/{questionsNeeded} picked
                                </span>
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="filter questions…"
                                    className="h-8 w-56"
                                />
                            </div>

                            {slots.map((slot) => {
                                const pickedIds = chosen[slot.key] ?? []
                                const visible = visibleFor(slot)
                                return (
                                    <div key={slot.key} className="rounded-lg border p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                                            <span className="font-medium text-muted-foreground">
                                                {slot.label}
                                            </span>
                                            <span
                                                className={
                                                    pickedIds.length === slot.count
                                                        ? "text-emerald-600 dark:text-emerald-500"
                                                        : "text-amber-600 dark:text-amber-500"
                                                }
                                            >
                                                {pickedIds.length}/{slot.count} ·{" "}
                                                {slot.kinds.join(" · ")}
                                            </span>
                                        </div>
                                        <ul className="grid max-h-44 gap-1 overflow-y-auto">
                                            {visible.map((question) => {
                                                const selected = pickedIds.includes(question.id)
                                                const full = pickedIds.length >= slot.count && !selected
                                                return (
                                                    <li key={question.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleQuestion(slot, question.id)}
                                                            disabled={full}
                                                            className={cn(
                                                                "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors",
                                                                selected
                                                                    ? "border-primary bg-primary/10"
                                                                    : "border-transparent hover:bg-muted",
                                                                full && "opacity-40"
                                                            )}
                                                        >
                                                            <span className="w-4 shrink-0 text-xs">
                                                                {selected ? "✓" : ""}
                                                            </span>
                                                            <span className="truncate">
                                                                {question.questionText}
                                                            </span>
                                                            <span className="ml-auto shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
                                                                {question.kind}
                                                            </span>
                                                        </button>
                                                    </li>
                                                )
                                            })}
                                            {visible.length === 0 && (
                                                <li className="px-2 py-1 text-xs text-muted-foreground">
                                                    {pool.isPending
                                                        ? "Loading the pool…"
                                                        : `No matching questions${search.trim() ? " for this filter" : ""}.`}
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )
                            })}

                            <p className="text-xs text-muted-foreground">
                                Pool: every published question
                                {pool.data
                                    ? ` (${pool.data.items.length} of ${pool.data.total} shown)`
                                    : ""}{" "}
                                — pick exactly what each turn asks for.
                            </p>
                        </div>
                    )}

                    {error && <p className="text-sm text-destructive">{error.message}</p>}

                    <DialogFooter className="items-center gap-2">
                        {reason && (
                            <span className="mr-auto text-xs text-muted-foreground">{reason}</span>
                        )}
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button onClick={submit} disabled={!valid || pending}>
                            {pending ? "Creating…" : "Create match"}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
