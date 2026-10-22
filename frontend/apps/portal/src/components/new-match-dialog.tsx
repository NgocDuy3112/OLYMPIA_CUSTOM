import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { useCreateMatch, useCreateQualificationMatch, useEnrolled } from "@/lib/tournament"
import type { TournamentDetail } from "@/lib/tournament"

// A match, placed by hand: the staff pick who plays whom.
// The mass event is the same thing with the whole roster and a question set.
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
    const createMass = useCreateQualificationMatch(tournamentId)

    const stages = tournament.stages ?? []

    const [kind, setKind] = useState<"STANDARD" | "QUALIFICATION">("STANDARD")
    const [label, setLabel] = useState("")
    const [stageId, setStageId] = useState(stages[0]?.id ?? "")
    const [questionCount, setQuestionCount] = useState(16)
    const [picked, setPicked] = useState<string[]>(Array.from({ length: seats }, () => ""))

    const players = enrolled.data?.items ?? []
    const chosen = picked.filter(Boolean)
    const valid = kind === "QUALIFICATION"
        ? label.trim().length > 0 && questionCount > 0
        : label.trim().length > 0
            && stageId.length > 0
            && chosen.length === seats
            && new Set(chosen).size === seats

    const reset = () => {
        setLabel("")
        setPicked(Array.from({ length: seats }, () => ""))
    }

    const submit = () => {
        const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        const options = { onSuccess: () => { reset(); onOpenChange(false) } }

        if (kind === "QUALIFICATION") {
            createMass.mutate(
                { label: label.trim(), scheduledAt, questionCount },
                options
            )
            return
        }

        create.mutate(
            { label: label.trim(), stageId, scheduledAt, playerIds: chosen },
            options
        )
    }

    const error = create.isError ? create.error : createMass.isError ? createMass.error : null
    const pending = create.isPending || createMass.isPending

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>New match</DialogTitle>
                        <DialogDescription>
                            {kind === "STANDARD"
                                ? `Pick ${seats} players. The questions come from the tournament's rules.`
                                : "The mass event: everyone in the roster answers the same questions, once."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant={kind === "STANDARD" ? "default" : "outline"}
                            onClick={() => setKind("STANDARD")}
                        >
                            Points match
                        </Button>
                        <Button
                            size="sm"
                            variant={kind === "QUALIFICATION" ? "default" : "outline"}
                            onClick={() => setKind("QUALIFICATION")}
                        >
                            Mass event
                        </Button>
                    </div>

                    <label className="flex flex-col gap-2 text-sm">
                        Label
                        <Input
                            value={label}
                            placeholder={kind === "STANDARD" ? "Match 1" : "Qualification"}
                            onChange={(event) => setLabel(event.target.value)}
                        />
                    </label>

                    {kind === "STANDARD" ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <label className="flex items-center gap-3 text-sm">
                                Questions
                                <Input
                                    type="number"
                                    className="h-8 w-24"
                                    value={questionCount}
                                    onChange={(event) => setQuestionCount(Number(event.target.value))}
                                />
                            </label>
                            <p className="text-sm text-muted-foreground">
                                The whole roster ({players.length} players) is seated. The field is ranked
                                by the crowd-weighted score when the match is closed.
                            </p>
                        </>
                    )}

                    {error && <p className="text-sm text-destructive">{error.message}</p>}

                    <DialogFooter>
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
