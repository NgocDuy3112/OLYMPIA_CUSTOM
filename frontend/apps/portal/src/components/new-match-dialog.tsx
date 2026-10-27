import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { useCreateMatch, useEnrolled } from "@/lib/tournament"
import type { TournamentDetail } from "@/lib/tournament"

// A match, placed by hand: the staff pick who plays whom.
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

    const players = enrolled.data?.items ?? []
    const chosen = picked.filter(Boolean)
    const valid = label.trim().length > 0
        && stageId.length > 0
        && chosen.length === seats
        && new Set(chosen).size === seats

    const reset = () => {
        setLabel("")
        setPicked(Array.from({ length: seats }, () => ""))
    }

    const submit = () => {
        const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        create.mutate(
            { label: label.trim(), stageId, scheduledAt, playerIds: chosen },
            { onSuccess: () => { reset(); onOpenChange(false) } }
        )
    }

    const error = create.isError ? create.error : null
    const pending = create.isPending

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>New match</DialogTitle>
                        <DialogDescription>
                            Pick {seats} players. The questions come from the tournament's rules.
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
