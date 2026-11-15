import { useState, type ReactNode } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
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

    let reason: string | null = null
    if (chosenPlayers.length !== seatCount) reason = `Pick ${seatCount} distinct players`
    if (new Set(chosenPlayers).size !== seatCount) reason = `Pick ${seatCount} distinct players`
    if (stages.length === 0) reason = "Choose a stage"
    if (stageId.length === 0) reason = "Choose a stage"
    if (label.trim().length === 0) reason = "Give the match a label"
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

    let error: typeof create.error = null
    if (create.isError) error = create.error
    const pending = create.isPending
    let createLabel = "Create match"
    if (pending) createLabel = "Creating…"

    let stageSlot: ReactNode = (
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
    )
    if (stages.length === 0) {
        stageSlot = (
            <span className="text-sm text-destructive">
                This tournament has no stages yet. Add them first — a match has
                to name one, and the stage order is what places the players.
            </span>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>New match</DialogTitle>
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
                                {stageSlot}
                            </label>

                            
                            {allowedSeats.length > 1 && (
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Seats</span>
                                    {allowedSeats.map((count) => {
                                        let variant: "default" | "outline" = "outline"
                                        if (seatCount === count) variant = "default"
                                        return (
                                            <Button
                                                key={count}
                                                type="button"
                                                size="sm"
                                                variant={variant}
                                                onClick={() => reseat(count)}
                                            >
                                                {count}
                                            </Button>
                                        )
                                    })}
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                {picked.map((value, seat) => (
                                    <select
                                        key={seat}
                                        className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                        value={value}
                                        onChange={(event) =>
                                            setPicked((current) =>
                                                current.map((item, index) => {
                                                    if (index === seat) return event.target.value
                                                    return item
                                                })
                                            )
                                        }
                                    >
                                        <option value="">Seat {seat + 1} — choose a player…</option>
                                        {players.map((player) => {
                                            let groupText = " · chưa xếp nhóm"
                                            if (player.group) groupText = ` · Nhóm ${player.group}`
                                            return (
                                                <option
                                                    key={player.userId}
                                                    value={player.userId}
                                                    disabled={picked.includes(player.userId) && picked[seat] !== player.userId}
                                                >
                                                    
                                                    {player.displayName}
                                                    {groupText}
                                                </option>
                                            )
                                        })}
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
                            {createLabel}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
