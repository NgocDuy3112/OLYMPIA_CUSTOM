import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { DialogOverlay } from "@/components/ui/dialog"
import { formatDay } from "@/lib/format"
import { carryOverPoints, placementLabel } from "@/lib/rankingPoints"
import { STATUS_LABEL, STATUS_VARIANT } from "@/components/schedule/status"
import type { Match, StandingRow } from "@/data/schedule"

interface PlayerDrawerProps {
    player: StandingRow
    matches: Match[]
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function PlayerDrawer({
    player,
    matches,
    open,
    onOpenChange,
}: PlayerDrawerProps) {
    const carry = carryOverPoints(player.prevPoints)
    const history = matches
        .filter((m) => m.players.some((p) => p.id === player.id))
        .sort((a, b) =>
            (a.date + a.startTime).localeCompare(b.date + b.startTime)
        )

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogOverlay />
                <DialogPrimitive.Popup
                    className={cn(
                        "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-6 overflow-y-auto bg-popover p-6 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-200 outline-none",
                        "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right",
                        "data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right"
                    )}
                >
                    {/* header */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                            <h2 className="font-heading text-xl font-semibold">
                                {player.name}
                            </h2>
                            <span className="text-xs text-muted-foreground">
                                Hạng {player.rank} · {placementLabel(player.best)}
                            </span>
                        </div>
                        <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                            <X className="size-4" aria-hidden />
                            <span className="sr-only">Đóng</span>
                        </DialogPrimitive.Close>
                    </div>

                    {/* stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <Stat label="Tổng điểm" value={player.points + carry} strong />
                        <Stat label="Điểm mùa này" value={player.points} />
                        <Stat label="Điểm mùa trước" value={player.prevPoints} />
                        <Stat label="Cộng dồn (50%)" value={carry} />
                    </div>

                    {/* history */}
                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-semibold">Lịch sử thi đấu</h3>
                        {history.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Chưa có trận nào.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1.5">
                                {history.map((match) => {
                                    const p = match.players.find(
                                        (x) => x.id === player.id
                                    )
                                    if (!p) return null
                                    return (
                                        <li
                                            key={match.id}
                                            className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                                        >
                                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                {formatDay(match.date)}{" "}
                                                {match.startTime}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">
                                                {match.round}
                                            </span>
                                            <Badge
                                                variant={STATUS_VARIANT[match.status]}
                                            >
                                                {STATUS_LABEL[match.status]}
                                            </Badge>
                                            <span className="shrink-0 text-xs font-medium tabular-nums">
                                                {match.status === "UPCOMING"
                                                    ? "–"
                                                    : `#${p.rank} · ${p.score}`}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}

function Stat({
    label,
    value,
    strong = false,
}: {
    label: string
    value: number
    strong?: boolean
}) {
    return (
        <div className="flex flex-col gap-1 rounded-xl border border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span
                className={cn(
                    "font-heading text-xl font-semibold tabular-nums",
                    strong && "text-foreground"
                )}
            >
                {value}
            </span>
        </div>
    )
}