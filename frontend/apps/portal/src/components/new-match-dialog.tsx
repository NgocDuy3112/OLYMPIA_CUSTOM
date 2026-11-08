import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { seatsPhrase } from "@/lib/tournaments"
import { useCreateMatch, useEnrolled } from "@/lib/tournament"
import type { TournamentDetail } from "@/lib/tournament"



const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

export function NewMatchDialog({
    tournamentId,
    tournament,
    seats,
    allowedSeats,
    open,
    onOpenChange,
}: {
    tournamentId: string
    tournament: TournamentDetail
    seats: number
    allowedSeats: number[]
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const enrolled = useEnrolled(tournamentId)
    const create = useCreateMatch(tournamentId)

    const stages = tournament.stages ?? []

    const [label, setLabel] = useState("")
    const [stageId, setStageId] = useState(stages[0]?.id ?? "")
    const [seatCount, setSeatCount] = useState(seats)
    const [picked, setPicked] = useState<string[]>(Array.from({ length: seats }, () => ""))



    const players = enrolled.data?.items ?? []
    const chosenPlayers = picked.filter(Boolean)

    const reseat = (count: number) => {
        setSeatCount(count)
        setPicked((current) => Array.from({ length: count }, (_, index) => current[index] ?? ""))
    }

    const reason =
        label.trim().length === 0
            ? "Give the match a label"
            : stages.length === 0 || stageId.length === 0
              ? "Choose a stage"
              : chosenPlayers.length !== seatCount || new Set(chosenPlayers).size !== seatCount
                ? `Pick ${seatCount} distinct players`
                : null
    const valid = reason === null

    const reset = () => {
        setLabel("")
        setPicked(Array.from({ length: seats }, () => ""))
    }



    const submit = () => {
        const scheduledAt = inOneHour()
        create.mutate(
            { label: label.trim(), stageId, scheduledAt, playerIds: chosenPlayers },
            { onSuccess: () => { reset(); onOpenChange(false) } }
        )
    }

    const error = create.isError ? create.error : null
    const pending = create.isPending

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>New match</DialogTitle>
                        <DialogDescription>
                            Pick {allowedSeats.length > 1 ? seatsPhrase(allowedSeats) : seatCount} players.
                            Questions are added on the match page after it&apos;s created.
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

                            
                            {allowedSeats.length > 1 ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Seats</span>
                                    {allowedSeats.map((count) => (
                                        <Button
                                            key={count}
                                            type="button"
                                            size="sm"
                                            variant={seatCount === count ? "default" : "outline"}
                                            onClick={() => reseat(count)}
                                        >
                                            {count}
                                        </Button>
                                    ))}
                                </div>
                            ) : null}

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
                                                {player.group ? ` · Nhóm ${player.group}` : " · chưa xếp nhóm"}
                                            </option>
                                        ))}
                                    </select>
                                ))}
                            </div>

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
