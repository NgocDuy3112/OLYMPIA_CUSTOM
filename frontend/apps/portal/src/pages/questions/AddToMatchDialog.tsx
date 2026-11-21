import { useState } from "react"
import { ExternalLink, X } from "lucide-react"
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
import { bucketOf } from "./model"
import type { BankQuestion } from "./model"

export function AddToMatchDialog({ rows, onClose }: { rows: BankQuestion[] | null; onClose: () => void }) {
    const tournaments = useTournaments({ limit: 50 })
    const [tournamentId, setTournamentId] = useState("")
    const [matchId, setMatchId] = useState("")
    const matches = useMatches(tournamentId)
    const upcoming = (matches.data?.items ?? []).filter((match) => match.status === "UPCOMING")

    if (!rows || rows.length === 0) return null

    const ready = Boolean(tournamentId && matchId && rows.some((row) => bucketOf(row)))
    let matchPlaceholder = "— chọn trận —"
    if (matches.isPending) matchPlaceholder = "Đang tải…"
    const go = () => {
        if (!ready) return
        window.location.assign(
            `/tournaments/${tournamentId}/matches/${matchId}?add=${encodeURIComponent(
                rows.map((row) => row.id).join(",")
            )}`
        )
    }

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Thêm vào trận</DialogTitle>
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
                                    {match.label} · {match.stageId} · slot {match.slot ?? "—"}
                                </option>
                            ))}
                        </select>
                    </label>
                    {tournamentId && !matches.isPending && upcoming.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                            Giải này chưa có trận UPCOMING nào.
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        aria-label="Hủy"
                        title="Hủy"
                        onClick={onClose}
                    >
                        <X className="size-4" aria-hidden />
                    </Button>
                    <Button
                        aria-label="Mở trận và thêm"
                        title="Mở trận và thêm"
                        onClick={go}
                        disabled={!ready}
                    >
                        <ExternalLink className="size-4" aria-hidden />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
