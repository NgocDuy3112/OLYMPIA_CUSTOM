import { useState } from "react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import { useEnrolled, useSetMatchResults, useTransitionMatch } from "@/lib/tournament"
import type { MatchSummary } from "@/lib/tournament"


export function StandardMatchControl({
    tournamentId,
    match,
}: {
    tournamentId: string
    match: MatchSummary
}) {
    const enrolled = useEnrolled(tournamentId)
    const transition = useTransitionMatch(tournamentId)
    const save = useSetMatchResults(tournamentId)
    const [scores, setScores] = useState<Record<string, string>>({})

    const names = new Map(
        (enrolled.data?.items ?? []).map((row) => [row.userId, row.displayName])
    )
    const seated = match.players.map((seat) => ({ id: seat.userId, seed: seat.seed }))

    const transitionError = transition.isError ? transition.error.message : null
    const saveError = save.isError ? save.error.message : null

    const submitResults = () => {
        save.mutate({
            matchId: match.id,
            totals: seated.map((player) => ({
                userId: player.id,
                score: Number(scores[player.id] ?? 0),
            })),
        })
    }

    const when = new Date(match.scheduledAt).toLocaleString("en-GB", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    })

    return (
        <section className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                <span>{match.stageId}</span>
                <span aria-hidden="true">·</span>
                <span>Slot {match.slot ?? "—"}</span>
                <span aria-hidden="true">·</span>
                <span>{when}</span>
            </div>

            {match.status === "UPCOMING" && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-semibold">Sẵn sàng bắt đầu?</p>
                        <p className="text-sm text-muted-foreground">
                            Bắt đầu chuyển trận sang LIVE — socket live mở cho thí sinh của trận.
                            Nhập kết quả bên dưới sẽ kết thúc trận.
                        </p>
                    </div>
                    <Button
                        onClick={() => transition.mutate({ matchId: match.id, status: "LIVE" })}
                        disabled={transition.isPending}
                    >
                        {transition.isPending ? "Đang bắt đầu…" : "Bắt đầu trận ▶"}
                    </Button>
                </div>
            )}

            {match.status === "LIVE" && (
                <p className="mt-4 text-sm text-muted-foreground">
                    <Badge variant="destructive" className="mr-2">LIVE</Badge>
                    Phần chơi chạy qua socket live — nhập điểm bên dưới khi trận xong.
                </p>
            )}

            {transitionError && (
                <p role="alert" className="mt-3 text-sm text-destructive">{transitionError}</p>
            )}

            <hr className="my-4" />

            {match.status === "FINISHED" ? (
                <p className="text-sm text-muted-foreground">
                    <Badge variant="secondary" className="mr-2">Đã kết thúc</Badge>
                    Kết quả đã được ghi nhận — bảng xếp hạng và bracket đọc từ đây.
                </p>
            ) : (
                <>
                    <p className="text-sm font-semibold">Nhập kết quả</p>
                    <p className="mb-3 mt-1 text-sm text-muted-foreground">
                        Tổng điểm cuối cùng của từng thí sinh. Lưu sẽ kết thúc trận và cập nhật
                        bảng xếp hạng.
                    </p>
                    <div className="flex flex-col gap-3">
                        {seated.map((player) => (
                            <label key={player.id} className="flex items-center gap-3 text-sm">
                                <span className="w-40 truncate">{names.get(player.id) ?? player.id}</span>
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    className="w-28"
                                    value={scores[player.id] ?? ""}
                                    placeholder="0"
                                    onChange={(event) =>
                                        setScores((state) => ({ ...state, [player.id]: event.target.value }))
                                    }
                                    aria-label={`Score for ${names.get(player.id) ?? player.id}`}
                                />
                            </label>
                        ))}
                    </div>
                    {saveError && <p role="alert" className="mt-3 text-sm text-destructive">{saveError}</p>}
                    <div className="mt-4 flex justify-end">
                        <Button onClick={submitResults} disabled={save.isPending || seated.length === 0}>
                            {save.isPending ? "Đang lưu…" : "Lưu kết quả & kết thúc"}
                        </Button>
                    </div>
                </>
            )}
        </section>
    )
}


export function StatusBadge({ status }: { status: MatchSummary["status"] }) {
    if (status === "LIVE") return <Badge variant="destructive">LIVE</Badge>
    if (status === "FINISHED") return <Badge variant="secondary">Đã kết thúc</Badge>
    return <Badge variant="outline">Sắp diễn ra</Badge>
}
