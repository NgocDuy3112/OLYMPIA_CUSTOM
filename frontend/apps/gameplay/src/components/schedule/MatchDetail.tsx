import { ArrowLeft, Trophy } from "lucide-react"
import { RoundChart } from "@/components/match/RoundChart"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "cn"
import type { Match } from "@/data/schedule"
import { pointsForPlacement } from "@/lib/rankingPoints"
import { STATUS_LABEL, STATUS_VARIANT } from "./status"

interface MatchDetailProps {
    match: Match
    onBack: () => void
}

export function MatchDetail({ match, onBack }: MatchDetailProps) {
    const players = match.players
    const isLive = (match.status === "LIVE")
    const hasResults = (match.status !== "UPCOMING")
    const winnerId = (match.status === "FINISHED") ? match.players.find((p) => p.rank === 1)?.id : undefined

    const scores = players.map((p) => p.score ?? 0)
    const totalScore = scores.reduce((sum, s) => sum + s, 0)
    const topScore = hasResults ? Math.max(...scores) : 0

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:py-10">
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

            <Card size="sm" className={cn(isLive && "ring-2 ring-destructive")}>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:gap-5">
                    <div className="flex shrink-0 flex-row items-center justify-center gap-3 self-stretch border-b border-border pb-2 sm:w-fit sm:shrink-0 sm:flex-col sm:gap-0 sm:border-b-0 sm:border-r sm:px-2 sm:pb-0">
                        <div className="flex flex-col items-center gap-1 text-center">
                            <h1 className="font-heading text-xl font-semibold leading-tight">
                                {match.round}
                            </h1>
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
                        <RoundChart players={players} />
                    </div>
                </TabsContent>

                <TabsContent value="statistics" className="flex flex-col gap-4">
                    {hasResults ? (
                        <>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <Stat label="Total score" value={totalScore} />
                                <Stat label="Top score" value={topScore} />
                                <Stat
                                    label="Points awarded"
                                    value={players.reduce(
                                        (sum, p) => sum + pointsForPlacement(p.rank ?? 0),
                                        0
                                    )}
                                />
                            </div>

                            <Card size="sm">
                                <CardContent>
                                    <ul className="flex flex-col gap-1.5">
                                        {players.map((player) => (
                                            <li
                                                key={player.id}
                                                className="flex items-center gap-3 rounded-md px-2 py-1.5"
                                            >
                                                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                                                    {player.rank ?? "-"}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate">
                                                    {player.name}
                                                </span>
                                                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                                                    {player.score ?? 0}
                                                </span>
                                                <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                                                    +{pointsForPlacement(player.rank ?? 0)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
                            <p className="font-medium">No statistics yet</p>
                            <p className="text-sm text-muted-foreground">
                                Statistics appear once the match starts.
                            </p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex flex-col gap-1 rounded-xl border border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="font-heading text-xl font-semibold tabular-nums">
                {value}
            </span>
        </div>
    )
}