import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { DialogOverlay } from "@/components/ui/dialog"
import { formatDay } from "@/lib/format"
import { carryOverPoints, placementLabel } from "@/lib/rankingPoints"
import { STATUS_LABEL, STATUS_VARIANT } from "@/components/schedule/status"
import type { Match, StandingRow } from "@/data/schedule"
import { DialogTitle } from "@/components/ui/dialog"


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
            (b.date + b.startTime).localeCompare(a.date + a.startTime)
        )

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogOverlay />
                <DialogPrimitive.Popup
                    className={cn(
                        "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-8 overflow-y-auto bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-200 outline-none",
                        "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right",
                        "data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right"
                    )}
                >
                    {/* header */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                            <DialogTitle className="font-heading text-3xl font-semibold">
                                {player.name}
                            </DialogTitle>
                        </div>
                        <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                            <X className="size-4" aria-hidden />
                            <span className="sr-only">Đóng</span>
                        </DialogPrimitive.Close>
                    </div>

                    <div className="flex flex-col gap-3">
                        <h3 className="text-xl font-semibold">Olympia Custom Points</h3>
                        <div className="grid grid-cols-3 gap-1">
                            <Stat label="Tổng điểm" value={player.points + carry} strong />
                            <Stat label="Điểm mùa này" value={player.points} />
                            <Stat label="Điểm mùa trước" value={player.prevPoints} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xl font-semibold">Thành tích thứ hạng</h3>
                        <div className="grid grid-cols-2 gap-1">
                            <Stat label="Hạng mùa này" value={`#${player.rank}`} />
                            <Stat label="Hạng cao nhất" value={`#${player.best}`} />
                        </div>
                    </div>

                    {/* history */}
                    <div className="flex flex-col gap-2">
                        <h2 className="text-xl font-semibold">Lịch sử thi đấu</h2>
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
                                            className="flex flex-col gap-1 rounded-md border border-border px-3 py-2"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="min-w-0 truncate font-medium">
                                                    {match.round}
                                                </span>
                                                <Badge variant={STATUS_VARIANT[match.status]}>
                                                    {STATUS_LABEL[match.status]}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                                <span className="font-medium tabular-nums text-foreground">
                                                    {match.status === "UPCOMING" ? "–" : `#${p.rank} · ${p.score}`}
                                                </span>
                                                <span className="tabular-nums">
                                                    {formatDay(match.date)} · {match.startTime}
                                                </span>
                                            </div>
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
    value: number | string
    strong?: boolean
}) {
    return (
        <div className="flex flex-col gap-1 rounded-xl border border-border px-3 py-3 text-center">
            <span
                className={cn(
                    "font-heading text-3xl font-bold tabular-nums leading-none",
                    strong ? "text-foreground" : "text-muted-foreground"
                )}
            >
                {value}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
    )
}