import { ArrowLeft, Trophy } from "lucide-react"
import { RoundChart } from "@/components/match/RoundChart"
import { buttonVariants } from "@shared/ui/button"
import { Badge } from "@shared/ui/badge"
import { Card, CardContent } from "@shared/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { cn } from "cn"
import type { TournamentRound } from "@/lib/api"
import type { Match } from "@/lib/types"
import { statisticsFor } from "@/lib/match-stats"
import { STATUS_LABEL, STATUS_VARIANT } from "./status"

interface MatchDetailProps {
    match: Match
    // The tournament's rounds: the chart's axis and the scores' key order.
    rounds: TournamentRound[]
    /** Page mode keeps the Back button; the drawer supplies its own chrome. */
    onBack?: () => void
    variant?: "page" | "drawer"
}

export function MatchDetail({ match, rounds, onBack, variant = "page" }: MatchDetailProps) {
    const players = match.players
    const isLive = (match.status === "LIVE")
    const hasResults = (match.status !== "UPCOMING")
    const winnerId = (match.status === "FINISHED") ? match.players.find((p) => p.rank === 1)?.id : undefined
    const stats = statisticsFor(match, rounds)

    const body = (
        <>
            <Card size="sm" className={cn(isLive && "ring-2 ring-destructive")}>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:gap-5">
                    <div className="flex shrink-0 flex-row items-center justify-center gap-3 self-stretch border-b border-border pb-2 sm:w-fit sm:shrink-0 sm:flex-col sm:gap-0 sm:border-b-0 sm:border-r sm:px-2 sm:pb-0">
                        <div className="flex flex-col items-center gap-1 text-center">
                            <h2 className="font-heading text-xl font-semibold leading-tight">
                                {match.round}
                            </h2>
                            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                                {match.startTime}
                            </span>
                        </div>
                        <Badge className="sm:mt-3" variant={STATUS_VARIANT[match.status]}>
                            {isLive && (
                                <span
                                    className="size-1.5 animate-pulse rounded-full bg-current"
                                    aria-hidden
                                />
                            )}
                            {STATUS_LABEL[match.status]}
                        </Badge>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <ul className="flex flex-col gap-2">
                            {players.map((player) => {
                                const isWinner = player.id === winnerId
                                return (
                                    <li
                                        key={player.id}
                                        className={cn(
                                            "flex items-center gap-3 rounded-md px-2 py-2",
                                            isLive && player.rank === 1 && "font-medium"
                                        )}
                                    >
                                        <span className="min-w-0 flex-1 truncate text-base">
                                            {player.name}
                                        </span>
                                        {isWinner && (
                                            <Badge variant="default" className="shrink-0 gap-1">
                                                <Trophy className="size-3" aria-hidden />
                                                Nhất trận đấu
                                            </Badge>
                                        )}
                                        <span className="w-8 shrink-0 text-right text-base tabular-nums text-muted-foreground">
                                            {hasResults ? (player.score ?? 0) : "-"}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="general">
                <TabsList className="w-full!">
                    <TabsTrigger value="general">Diễn biến</TabsTrigger>
                    <TabsTrigger value="statistics">Thống kê</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="flex flex-col gap-4">
                    {match.status === "UPCOMING" && (
                        <p className="text-sm text-muted-foreground">
                            Trận đấu sắp bắt đầu
                        </p>
                    )}
                    {match.status === "FINISHED" && (
                        <p className="text-sm text-muted-foreground">
                            Trận đấu đã kết thúc
                        </p>
                    )}
                    <div className="flex flex-col gap-2">
                        <h3 className="font-heading text-base font-semibold">
                            Điểm theo vòng thi
                        </h3>
                        <RoundChart rounds={rounds} players={players} />
                    </div>
                </TabsContent>

                <TabsContent value="statistics" className="flex flex-col gap-4">
                    {hasResults ? (
                        <>
                            {/* the headline numbers — derived from the round scores */}
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <Stat label="Tổng điểm cả trận" value={stats.totalPoints} />
                                <Stat label="Điểm cao nhất" value={stats.topScore} />
                                <Stat label="Trung bình / thí sinh" value={stats.averageScore.toFixed(1)} />
                                <Stat label="Cách biệt #1 – #2" value={stats.margin ?? "—"} />
                                <Stat label="Số vòng thi" value={stats.rounds.length} />
                                <Stat
                                    label="Thắng nhiều vòng"
                                    value={
                                        stats.roundWins
                                            ? `${stats.roundWins.names.join(", ")} · ${stats.roundWins.count}`
                                            : "—"
                                    }
                                />
                            </div>

                            {/* the round breakdown: every player, every round */}
                            <div className="flex flex-col gap-2">
                                <h3 className="font-heading text-base font-semibold">Điểm từng vòng</h3>
                                <div className="overflow-x-auto rounded-xl border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/40 text-muted-foreground">
                                                <th className="px-3 py-2 text-left font-medium">Vòng</th>
                                                {players.map((p) => (
                                                    <th key={p.id} className="px-2 py-2 text-right font-medium">
                                                        <span className="block max-w-24 truncate ml-auto">{p.name}</span>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.rounds.map((row) => (
                                                <tr key={row.round} className="border-b last:border-b-0">
                                                    <td className="whitespace-nowrap px-3 py-2">{row.round}</td>
                                                    {players.map((p) => {
                                                        const cell = row.scores.find((s) => s.playerId === p.id)
                                                        const won = row.winnerIds.includes(p.id)
                                                        return (
                                                            <td
                                                                key={p.id}
                                                                className={cn(
                                                                    "px-2 py-2 text-right tabular-nums",
                                                                    won ? "font-semibold" : "text-muted-foreground"
                                                                )}
                                                            >
                                                                {cell?.points ?? 0}
                                                                {won && (
                                                                    <Trophy
                                                                        className="ml-1 inline size-3 text-amber-500"
                                                                        aria-label="thắng vòng"
                                                                    />
                                                                )}
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-muted/40 font-medium">
                                                <td className="px-3 py-2">Tổng</td>
                                                {players.map((p) => (
                                                    <td key={p.id} className="px-2 py-2 text-right tabular-nums">
                                                        {p.score ?? 0}
                                                    </td>
                                                ))}
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
                            <p className="font-medium">Chưa có thống kê</p>
                            <p className="text-sm text-muted-foreground">
                                Thống kê hiển thị sau khi trận bắt đầu.
                            </p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </>
    )

    if (variant === "drawer") {
        return <div className="flex flex-col gap-5">{body}</div>
    }

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:py-10">
            {onBack && (
                <div>
                    <button
                        type="button"
                        onClick={onBack}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                        <ArrowLeft />
                        Back
                    </button>
                </div>
            )}
            {body}
        </div>
    )
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex flex-col gap-1 rounded-xl border border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="font-heading text-xl font-semibold tabular-nums break-words">
                {value}
            </span>
        </div>
    )
}
