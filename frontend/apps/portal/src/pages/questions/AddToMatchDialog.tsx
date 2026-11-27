import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import { ApiError, api } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { useMatches, type MatchDetail } from "@/lib/tournament"
import { useTournaments } from "@/lib/tournaments"
import {
    ALL_GROUPS,
    entryFromFrozen,
} from "@/components/match-question/model"
import { bucketOf } from "./model"
import { errorMessage } from "@shared/lib/error-text"
import type { BankQuestion } from "./model"

interface UsageItem {
    id: string
    tournamentId: string
    label: string
    stageId: string
    status: string
}

function RowUsage({ id }: { id: string }) {
    const usage = useQuery({
        queryKey: ["question-usage", id],
        queryFn: () => api<{ items: UsageItem[] }>(`/portal/questions/${id}/usage`),
        staleTime: 15_000,
    })
    if (usage.isPending) return <p className="text-xs text-muted-foreground">Đang tải…</p>
    if (usage.isError) return <p className="text-xs text-destructive">{errorMessage(usage.error)}</p>
    const items = usage.data?.items ?? []
    if (items.length === 0) return <p className="text-xs text-muted-foreground">Chưa gán trận nào</p>
    return (
        <p className="text-xs text-muted-foreground">
            Đã gán: {items.map((item) => item.label).join(", ")}
        </p>
    )
}

export function AddToMatchDialog({ rows, onClose }: { rows: BankQuestion[] | null; onClose: () => void }) {
    const tournaments = useTournaments({ limit: 50 })
    const [tournamentId, setTournamentId] = useState("")
    const [matchId, setMatchId] = useState("")
    const [submitError, setSubmitError] = useState<string | null>(null)
    const matches = useMatches(tournamentId)
    const queryClient = useQueryClient()
    const upcoming = (matches.data?.items ?? []).filter((match) => match.status === "UPCOMING")
    const match = (matches.data?.items ?? []).find((candidate) => candidate.id === matchId) ?? null
    const detail = useQuery({
        queryKey: ["match-detail", tournamentId, matchId],
        queryFn: () =>
            api<MatchDetail>(`/portal/tournaments/${tournamentId}/matches/${matchId}`),
        enabled: Boolean(tournamentId && matchId),
        staleTime: 15_000,
    })
    const unmapped = (rows ?? []).filter((row) => {
        const bucket = bucketOf(row)
        if (!bucket) return true
        return !ALL_GROUPS.some((group) => group.bucket === bucket)
    })

    const save = useMutation({
        mutationFn: () => {
            if (detail.data === undefined) {
                throw new Error("Đang tải revision hiện tại của trận.")
            }
            const kept = (match?.questions ?? []).map((question) => entryFromFrozen(question)).map((entry) => {
                const item: { roundId: string; turnId: string; sourceId: string; points?: number } = {
                    roundId: entry.roundId,
                    turnId: entry.turnId,
                    sourceId: entry.sourceId,
                }
                if (entry.points !== undefined) item.points = entry.points
                return item
            })
            const added: Array<{ roundId: string; turnId: string; sourceId: string; points?: number }> = []
            for (const row of rows ?? []) {
                const bucket = bucketOf(row)
                const group = ALL_GROUPS.find((candidate) => candidate.bucket === bucket)
                if (!group) continue
                const item: { roundId: string; turnId: string; sourceId: string; points?: number } = {
                    roundId: group.roundId,
                    turnId: group.turnId,
                    sourceId: row.id,
                }
                if (group.points !== undefined) item.points = group.points
                added.push(item)
            }
            return api<{ assemblyRevision: number }>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/assemble`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        questions: [...kept, ...added],
                        baseRevision: detail.data.assemblyRevision,
                    }),
                }
            )
        },
        retry: false,
        onSuccess: () => {
            setSubmitError(null)
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
            void queryClient.invalidateQueries({
                queryKey: ["match-detail", tournamentId, matchId],
            })
            onClose()
        },
        onError: (error) => {
            if (error instanceof ApiError && error.code === "CONFLICT") {
                setSubmitError("Trận đã đổi revision mới — tải lại danh sách trận rồi thử lại.")
                return
            }
            setSubmitError(errorMessage(error))
        },
    })

    if (!rows || rows.length === 0) return null

    const ready = Boolean(tournamentId && matchId && detail.data && rows.some((row) => bucketOf(row)))
    let matchPlaceholder = "— chọn trận —"
    if (matches.isPending) matchPlaceholder = "Đang tải…"
    const submit = () => {
        if (!ready || save.isPending) return
        setSubmitError(null)
        save.mutate()
    }

    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (next) return
                if (save.isPending) return
                onClose()
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Thêm vào trận</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                    <ul className="grid gap-3">
                        {rows.map((row) => (
                            <li key={row.id} className="grid gap-1 text-sm">
                                <span>{row.questionText}</span>
                                <RowUsage id={row.id} />
                            </li>
                        ))}
                    </ul>
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
                            {upcoming.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                    {candidate.label} · {candidate.stageId} · slot {candidate.slot ?? "—"}
                                </option>
                            ))}
                        </select>
                    </label>
                    {tournamentId && !matches.isPending && upcoming.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                            Giải này chưa có trận UPCOMING nào.
                        </p>
                    )}
                    {unmapped.length > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                            Bỏ qua {unmapped.length} câu không map được bucket: {unmapped.map((row) => row.questionText || row.id).join(", ")}
                        </p>
                    )}
                    {submitError && (
                        <p className="text-xs text-destructive">{submitError}</p>
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
                        aria-label="Thêm vào trận"
                        title="Thêm vào trận"
                        onClick={submit}
                        disabled={!ready || save.isPending}
                    >
                        {save.isPending ? "Đang thêm…" : "Thêm vào trận"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
