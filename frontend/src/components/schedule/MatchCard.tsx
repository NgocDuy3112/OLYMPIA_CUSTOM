import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "cn"
import type { Match } from "@/data/schedule"
import { orderMatchPlayers } from "@/lib/matchOrder"
import { STATUS_LABEL, STATUS_VARIANT } from "./status"

interface MatchCardProps {
    match: Match
    featured?: boolean
    onOpen?: () => void
}

export function MatchCard({ match, featured = false, onOpen }: MatchCardProps) {
    const players = orderMatchPlayers(match)
    const isLive = match.status === "LIVE"
    const winnerId = match.status === "FINISHED" ? players[0]?.id : undefined

    return (
        <Card
            size="sm"
            className={cn(
                isLive && "ring-1 ring-destructive/40",
                featured && "ring-2 ring-destructive"
            )}
            role={onOpen ? "button" : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onClick={onOpen}
        >
            <CardContent className="flex flex-col gap-1 sm:flex-row sm:gap-5">
                <div className="flex shrink-0 flex-row items-center justify-center gap-1 self-stretch border-b border-border pb-2 sm:w-36 sm:flex-col sm:border-b-0 sm:border-r sm:gap-0 sm:pb-0">
                    <h3 className="font-heading text-lg font-semibold">
                        {match.round}
                    </h3>
                    <span className="text-sm font-semibold tabular-nums">
                        {match.startTime}
                    </span>
                    <Badge variant={STATUS_VARIANT[match.status]}>
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
                    <ul className="flex flex-col gap-1.5">
                        {players.map((player) => {
                            const isWinner = player.id === winnerId

                            return (
                                <li
                                    key={player.id}
                                    className={cn(
                                        "flex items-center gap-3 rounded-md px-2 py-1.5",
                                        isWinner && "bg-muted font-semibold",
                                        isLive &&
                                        player.rank === 1 &&
                                        "font-medium"
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate">
                                        {player.name}
                                    </span>
                                    <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                                        {match.status === "UPCOMING"
                                            ? "-"
                                            : (player.score ?? 0)}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </CardContent>
        </Card>
    )
}