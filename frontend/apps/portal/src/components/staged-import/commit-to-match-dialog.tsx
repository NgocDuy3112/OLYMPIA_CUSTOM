import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link2, X } from "lucide-react"
import { api } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { useMatches } from "@/lib/tournament"
import { useTournaments } from "@/lib/tournaments"
import { invalidateAll, messageOf, type CommitResult } from "./types"

export function CommitToMatchDialog({
    batchId,
    onCommitted,
    onClose,
}: {
    batchId: string
    onCommitted: () => void
    onClose: () => void
}) {
    const queryClient = useQueryClient()
    const [tournamentId, setTournamentId] = useState("")
    const [matchId, setMatchId] = useState("")
    const [error, setError] = useState<string | null>(null)

    const tournaments = useTournaments({ limit: 50 })
    const matches = useMatches(tournamentId)
    const upcoming = (matches.data?.items ?? []).filter((match) => match.status === "UPCOMING")

    const commit = useMutation({
        mutationFn: () =>
            api<CommitResult>(`/portal/question-imports/${batchId}/commit-to-match`, {
                method: "POST",
                body: JSON.stringify({ tournamentId, matchId }),
            }),
        onSuccess: () => {
            invalidateAll(queryClient)
            void queryClient.invalidateQueries({ queryKey: ["matches"] })
            onCommitted()
            onClose()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    const ready = Boolean(tournamentId && matchId)
    let matchPlaceholder = "— chọn trận —"
    if (matches.isPending) matchPlaceholder = "Đang tải…"

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Commit vào trận</DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                        Giải đấu
                        <select
                            value={tournamentId}
                            onChange={(event) => {
                                setTournamentId(event.target.value)
                                setMatchId("")
                            }}
                            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                        >
                            <option value="">— chọn giải —</option>
                            {(tournaments.data?.items ?? []).map((tournament) => (
                                <option key={tournament.id} value={tournament.id}>
                                    {tournament.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="grid gap-1 text-sm">
                        Trận UPCOMING
                        <select
                            value={matchId}
                            onChange={(event) => setMatchId(event.target.value)}
                            disabled={!tournamentId || matches.isPending}
                            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                        >
                            <option value="">
                                {matchPlaceholder}
                            </option>
                            {upcoming.map((match) => (
                                <option key={match.id} value={match.id}>
                                    {match.label} · {match.stageId}
                                </option>
                            ))}
                        </select>
                    </label>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter className="items-center gap-2">
                    <Button variant="outline" aria-label="Hủy" title="Hủy" onClick={onClose} disabled={commit.isPending}>
                        <X className="size-4" aria-hidden />
                    </Button>
                    <Button
                        aria-label="Commit vào trận"
                        title="Commit vào trận"
                        disabled={!ready || commit.isPending}
                        onClick={() => commit.mutate()}
                    >
                        <Link2 className="size-4" aria-hidden />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
