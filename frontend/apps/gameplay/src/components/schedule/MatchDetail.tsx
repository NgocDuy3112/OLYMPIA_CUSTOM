import { ArrowLeft, Trophy } from "lucide-react"
import { RoundChart } from "@/components/match/RoundChart"
import { buttonVariants } from "@shared/ui/button"
import { Badge } from "@shared/ui/badge"
import { Card, CardContent } from "@shared/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { cn } from "cn"
import type { TournamentRound } from "@/lib/api"
import type { Match } from "@/lib/types"
import { statisticsFor, type RoundRow } from "@/lib/match-stats"
import { STATUS_LABEL, STATUS_VARIANT } from "./status"

interface MatchDetailProps {
    match: Match
    rounds: TournamentRound[]
    onBack?: () => void
    variant?: "page" | "drawer"
}

export function MatchDetail({ match, rounds, onBack, variant = "page" }: MatchDetailProps) {
    const players = match.players
    const isLive = (match.status === "LIVE")
    const hasResults = (match.status !== "UPCOMING")
    const winnerId = (match.status === "FINISHED") ? match.players.find((p) => p.rank === 1)?.id : undefined
    const stats = statisticsFor(match, rounds)

    const roundRowOf = (roundId: string) => {
        const name = rounds.find((r) => r.id === roundId)?.name
        return stats.rounds.find((row) => row.round === name)
    }

    const statsPending = (title: string, note: string) => (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{note}</p>
        </div>
    )

    const roundTab = (roundId: string) => {
        if (!hasResults) return statsPending("Chưa có thống kê", "Thống kê hiển thị sau khi trận bắt đầu.")
        const row = roundRowOf(roundId)
        if (!row) return statsPending("Vòng này chưa diễn ra", "Thống kê hiển thị sau khi vòng thi kết thúc.")
        return <RoundStatsPanel row={row} />
    }

    const body = (
        <>
            <Card size="sm" className={cn(isLive && "ring-2 ring-destructive")}>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:gap-5">
                    <div className="flex shrink-0 flex-row items-center justify-center gap-3 self-stretch border-b border-border pb-2 sm:w-fit sm:shrink-0 sm:flex-col sm:gap-0 sm:border-b-0 sm:border-r sm:px-2 sm:pb-0">
                        <div className="flex flex-col items-center gap-1 text-center">
                            <h2 className="font-heading text-xl font-semibold leading-tight">
                                {match.round}
                            </h2>
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
                                                <Trophy className="size-6" aria-hidden />
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
                    <TabsTrigger value="general">Tổng Quan</TabsTrigger>
                    <TabsTrigger value="khoi-dong">Khởi Động</TabsTrigger>
                    <TabsTrigger value="giai-ma">Giải Mã</TabsTrigger>
                    <TabsTrigger value="but-pha">Bứt Phá</TabsTrigger>
                    <TabsTrigger value="ve-dich">Về Đích</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <RoundChart rounds={rounds} players={players} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="rounded-xl border">
                            <Table className={cn("[&_th]:h-10 [&_th]:text-sm [&_td]:py-2.5")}>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Thí sinh</TableHead>
                                        {stats.rounds.map((row) => (
                                            <TableHead key={row.round} className="text-right">
                                                {row.round}
                                            </TableHead>
                                        ))}
                                        <TableHead className="text-right">Tổng điểm</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {players.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell className="max-w-40">
                                                <span className="block truncate">{p.name}</span>
                                            </TableCell>
                                            {stats.rounds.map((row) => {
                                                const cell = row.scores.find((s) => s.playerId === p.id)
                                                const won = row.winnerIds.includes(p.id)
                                                return (
                                                    <TableCell
                                                        key={row.round}
                                                        className={cn(
                                                            "text-right tabular-nums",
                                                            won ? "font-semibold" : "text-muted-foreground"
                                                        )}
                                                    >
                                                        {cell?.points ?? 0}
                                                    </TableCell>
                                                )
                                            })}
                                            <TableCell className="text-right font-semibold tabular-nums">
                                                {p.score ?? 0}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                </TabsContent>

                {(["khoi-dong", "giai-ma", "but-pha", "ve-dich"] as const).map((roundId) => (
                    <TabsContent key={roundId} value={roundId} className="flex flex-col gap-4">
                        {roundTab(roundId)}
                    </TabsContent>
                ))}
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

// One round's own panel — the round's slice of the results, ranked: the baseline
// every round tab shows until its per-round metrics arrive.
function RoundStatsPanel({ row }: { row: RoundRow }) {
    const sorted = [...row.scores].sort((a, b) => b.points - a.points)

    return (
        <div className="rounded-xl border">
            <Table className={cn("[&_th]:h-10 [&_th]:text-sm [&_td]:py-2.5")}>
                <TableHeader>
                    <TableRow>
                        <TableHead>Thí sinh</TableHead>
                        <TableHead className="text-right">Điểm</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sorted.map((score) => {
                        const won = row.winnerIds.includes(score.playerId)
                        return (
                            <TableRow key={score.playerId}>
                                <TableCell className="max-w-40">
                                    <span className="block truncate">{score.name}</span>
                                </TableCell>
                                <TableCell
                                    className={cn(
                                        "text-right tabular-nums",
                                        won && "font-semibold"
                                    )}
                                >
                                    {score.points}
                                    {won && (
                                        <Trophy
                                            className="ml-1 inline size-3 text-amber-500"
                                            aria-label="thắng vòng"
                                        />
                                    )}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    )
}
