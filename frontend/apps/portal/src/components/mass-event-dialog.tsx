import { useState } from "react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { ApiError } from "@shared/lib/api"
import { useCloseMassEvent, useMassEvent } from "@/lib/season"


// The mass event: how the field answered, and the ranking it produced. The ranking is
// what the staff cut into tiers for the splitting stage.
export function MassEventDialog({
    tournamentId,
    seasonId,
    matchId,
    label,
    open,
    onOpenChange,
}: {
    tournamentId: string
    seasonId: string
    matchId: string
    label: string
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const view = useMassEvent(tournamentId, seasonId, matchId)
    const close = useCloseMassEvent(tournamentId, seasonId)

    // The tied groups the close refused, and the order the staff gave them.
    const [orders, setOrders] = useState<Record<string, string[]>>({})
    const [tiedGroups, setTiedGroups] = useState<string[][]>([])

    if (view.isPending) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{label}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">Loading the field…</p>
                </DialogContent>
            </Dialog>
        )
    }

    if (view.isError) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{label}</DialogTitle>
                    </DialogHeader>
                    <p role="alert" className="text-sm text-destructive">{view.error.message}</p>
                </DialogContent>
            </Dialog>
        )
    }

    const data = view.data
    const names = new Map(data.field.map((row) => [row.userId, row.displayName]))
    const ranked = [...data.results].sort((a, b) => a.rank - b.rank)

    const submit = () => {
        const tieBreaks = tiedGroups.map((players) => ({
            players,
            order: orders[players.join("|")] ?? players
        }))
        close.mutate(
            { matchId, tieBreaks: tieBreaks.length > 0 ? tieBreaks : undefined },
            {
                onSuccess: () => onOpenChange(false),
                onError: (error) => {
                    // The field tied: the close refuses until the staff order the group.
                    const details = error instanceof ApiError ? error.details ?? [] : []
                    setTiedGroups(details.map((group) => group.split(",").map((id) => id.trim())))
                },
            }
        )
    }

    const move = (group: string[], index: number, by: number) => {
        const key = group.join("|")
        const current = orders[key] ?? group
        const next = [...current]
        const target = index + by
        if (target < 0 || target >= next.length) return
        const [row] = next.splice(index, 1)
        next.splice(target, 0, row)
        setOrders((current) => ({ ...current, [key]: next }))
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>{label}</DialogTitle>
                        <DialogDescription>
                            {data.closed
                                ? "The field's ranking. Cut it into tiers of four for the splitting stage."
                                : `${data.questionCount} questions, ${data.field.length} players seated. The staff close it when everyone has answered.`}
                        </DialogDescription>
                    </DialogHeader>

                    {data.closed ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16 pl-6">Place</TableHead>
                                    <TableHead>Player</TableHead>
                                    <TableHead className="pr-6 text-right">Points</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ranked.map((entry) => (
                                    <TableRow key={entry.userId}>
                                        <TableCell className="pl-6 tabular-nums">{entry.rank}</TableCell>
                                        <TableCell>
                                            {entry.userId ? names.get(entry.userId) ?? entry.userId : "—"}
                                        </TableCell>
                                        <TableCell className="pr-6 text-right tabular-nums">
                                            {entry.totalScore}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-6">Player</TableHead>
                                    <TableHead className="pr-6 text-right">Answered</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.field.map((row) => (
                                    <TableRow key={row.userId}>
                                        <TableCell className="pl-6">{row.displayName}</TableCell>
                                        <TableCell className="pr-6 text-right tabular-nums">
                                            {row.answered} / {data.questionCount}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    {tiedGroups.length > 0 && (
                        <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 p-4">
                            <p className="text-sm font-medium">
                                These players are tied: order them, and the tie-break counts for the
                                ranking only.
                            </p>
                            {tiedGroups.map((group) => {
                                const key = group.join("|")
                                const order = orders[key] ?? group
                                return (
                                    <div key={key} className="flex flex-col gap-1">
                                        {order.map((userId, index) => (
                                            <div key={userId} className="flex items-center gap-2 text-sm">
                                                <span className="w-6 tabular-nums text-muted-foreground">
                                                    {index + 1}
                                                </span>
                                                <span>{names.get(userId) ?? userId}</span>
                                                <span className="ml-auto flex gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        aria-label="Move up"
                                                        disabled={index === 0}
                                                        onClick={() => move(group, index, -1)}
                                                    >
                                                        ↑
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        aria-label="Move down"
                                                        disabled={index === order.length - 1}
                                                        onClick={() => move(group, index, 1)}
                                                    >
                                                        ↓
                                                    </Button>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {close.isError && tiedGroups.length === 0 && (
                        <p role="alert" className="text-sm text-destructive">{close.error.message}</p>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={close.isPending}
                        >
                            Close
                        </Button>
                        {!data.closed && (
                            <Button onClick={submit} disabled={close.isPending}>
                                {close.isPending ? "Closing…" : "Close the mass event"}
                            </Button>
                        )}
                    </DialogFooter>

                    {data.closed && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="secondary">Closed</Badge>
                            The ranking does not count for points — it seeds nothing by itself.
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
