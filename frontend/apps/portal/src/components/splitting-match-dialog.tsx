import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { useCreateSplittingMatch, useEnrolled } from "@/lib/progression"

export function NewSplittingMatchDialog({
    tournamentId,
    seasonId,
    round,
    slots,
    seats,
    open,
    onOpenChange,
}: {
    tournamentId: string
    seasonId: string
    round: number
    slots: number[]
    seats: number
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const enrolled = useEnrolled(tournamentId, seasonId)
    const create = useCreateSplittingMatch(tournamentId, seasonId)

    const [slot, setSlot] = useState<number>(slots[0] ?? 1)
    const [picked, setPicked] = useState<string[]>(Array.from({ length: seats }, () => ""))

    const players = enrolled.data?.items ?? []
    const chosen = picked.filter(Boolean)
    const valid = chosen.length === seats && new Set(chosen).size === seats

    const submit = () =>
        create.mutate(
            {
                round,
                slot,
                playerIds: chosen,
                scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            },
            {
                onSuccess: () => {
                    setPicked(Array.from({ length: seats }, () => ""))
                    onOpenChange(false)
                },
            }
        )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>New match — round {round}</DialogTitle>
                        <DialogDescription>
                            Pick {seats} players. Nothing checks the rank tiers: the groups are your call.
                        </DialogDescription>
                    </DialogHeader>

                    <label className="flex items-center gap-3 text-sm">
                        Slot
                        <select
                            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                            value={slot}
                            onChange={(event) => setSlot(Number(event.target.value))}
                        >
                            {slots.map((value) => (
                                <option key={value} value={value}>Match {value}</option>
                            ))}
                        </select>
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
                                        disabled={picked.includes(player.userId) && player.userId !== value}
                                    >
                                        {player.displayName}
                                    </option>
                                ))}
                            </select>
                        ))}
                    </div>

                    {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button onClick={submit} disabled={!valid || create.isPending}>
                            {create.isPending ? "Creating…" : "Create match"}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}