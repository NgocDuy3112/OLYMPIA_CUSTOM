import type { ReactNode } from "react"
import type { LobbyData } from "@/lib/live"

export function Lobby({
    data,
    meId,
    mc,
    hint,
}: {
    data: LobbyData
    /** Player shell: ring + dot-highlight this seat. */
    meId?: string | null
    /** Controller: the round buttons (absent = player shell). */
    mc?: {
        /** Match is LIVE and a version is in hand — the start click can send. */
        canStart: boolean
        busy?: boolean
        onStart: (roundId: string) => void
    }
    /** One muted line under the cards (waiting reason). */
    hint?: ReactNode
}) {
    const currentIdx = data.roundId ? data.rounds.findIndex((r) => r.id === data.roundId) : -1

    return (
        <div className="absolute inset-0 flex flex-col items-center px-[4cqw] pt-[5cqw] text-center">
            <h1 className="font-display font-bold uppercase leading-none text-foreground" style={{ fontSize: "3cqw" }}>
                {data.title}
            </h1>
            <p className="mt-[1.2cqw] font-sans font-medium leading-none text-muted-foreground" style={{ fontSize: "1.4cqw" }}>
                {data.title} - {data.label}
            </p>

            {/* seats */}
            <div className="mt-[3.2cqw] flex flex-wrap items-stretch justify-center gap-[1.2cqw]">
                {data.table.map((row) => {
                    const mine = Boolean(meId) && row.id === meId
                    const connected = data.connected.includes(row.id)
                    return (
                        <div
                            key={row.id}
                            className={`flex w-[15cqw] min-h-[7.5cqw] flex-col rounded-[0.8cqw] border bg-card px-[1.4cqw] py-[1.2cqw] text-left shadow-sm ${mine ? "ring-2 ring-sky-500" : "ring-1 ring-border"
                                }`}
                        >
                            <div className="flex items-center justify-between gap-[0.8cqw]">
                                <span className="flex min-w-0 items-center gap-[0.7cqw]">
                                    <span
                                        className={`size-[0.8cqw] shrink-0 rounded-full ${connected
                                                ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                                                : "bg-muted-foreground/40"
                                            }`}
                                    />
                                    <span className="truncate font-display font-bold uppercase leading-none text-foreground" style={{ fontSize: "1.5cqw" }}>
                                        {row.displayName}
                                    </span>
                                </span>
                                <span className="font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: "1.9cqw" }}>
                                    {row.points}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {hint && (
                <p className="mt-[2cqw] font-sans text-muted-foreground" style={{ fontSize: "1.3cqw" }}>
                    {hint}
                </p>
            )}

            {/* controller: one button per round — only the waiting one is live */}
            {mc && data.rounds.length > 0 && (
                <div className="mt-[3cqw] flex flex-wrap items-center justify-center gap-[1cqw]">
                    {data.rounds.map((round, i) => {
                        const isCurrent = i === currentIdx
                        const done = currentIdx >= 0 && i < currentIdx
                        const startable = Boolean(mc.canStart) && isCurrent && data.status === "LIVE"
                        return (
                            <button
                                key={round.id}
                                type="button"
                                disabled={done || !startable || mc.busy}
                                onClick={() => mc.onStart(round.id)}
                                title={
                                    done
                                        ? "Vòng đã chơi"
                                        : isCurrent
                                            ? data.status === "LIVE"
                                                ? `Bắt đầu vòng ${round.name}`
                                                : "Trận chưa mở — bắt đầu ở trang trận"
                                            : "Chưa tới vòng này"
                                }
                                className={`rounded-[0.5cqw] px-[1.8cqw] py-[0.8cqw] font-sans font-semibold uppercase leading-none tracking-wide transition ${startable
                                        ? "cursor-pointer bg-primary text-primary-foreground shadow-sm hover:brightness-110"
                                        : done
                                            ? "cursor-default bg-muted text-muted-foreground"
                                            : "cursor-default bg-card text-muted-foreground ring-1 ring-border"
                                    } ${mc.busy && startable ? "opacity-60" : ""}`}
                                style={{ fontSize: "1.2cqw" }}
                            >
                                {done ? "✓ " : isCurrent && startable ? "▶ " : ""}
                                {round.name}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default Lobby
