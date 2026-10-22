import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { useSetMatchResults } from "@/lib/season"

export function MatchResultDialog({
    tournamentId,
    seasonId,
    matchId,
    label,
    players,
    open,
    onOpenChange,
}: {
    tournamentId: string
    seasonId: string
    matchId: string
    label: string
    players: Array<{ userId: string; name: string }>
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const save = useSetMatchResults(tournamentId, seasonId)
    const [scores, setScores] = useState<Record<string, string>>({})

    const submit = () => {
        save.mutate(
            {
                matchId,
                totals: players.map((player) => ({
                    userId: player.userId,
                    score: Number(scores[player.userId] ?? 0),
                })),
            },
            { onSuccess: () => onOpenChange(false) }
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>{label}</DialogTitle>
                        <DialogDescription>
                            Type the final score for each player. This finishes the match.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-3">
                        {players.map((player) => (
                            <div key={player.userId} className="flex items-center justify-between gap-4">
                                <span className="text-sm">{player.name}</span>
                                <Input
                                    type="number"
                                    className="h-8 w-24 text-right"
                                    value={scores[player.userId] ?? ""}
                                    placeholder="0"
                                    onChange={(event) =>
                                        setScores((current) => ({
                                            ...current,
                                            [player.userId]: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                        ))}
                    </div>

                    {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button onClick={submit} disabled={save.isPending}>
                            {save.isPending ? "Saving…" : "Finish match"}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}