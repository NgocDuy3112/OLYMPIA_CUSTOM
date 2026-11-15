import { useEffect, useRef, useState, type ReactNode } from "react"
import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client"
import { X } from "lucide-react"
import { useSelfCam } from "@shared/lib/rtc"
import { Button } from "@shared/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog"
import { pt } from "./geometry"
import { SelfCamControls } from "./cam-controls"
import type { LobbyData } from "./types"


function LobbyVideo({ track }: { track: RemoteVideoTrack | LocalVideoTrack }) {
    const holder = useRef<HTMLSpanElement>(null)
    useEffect(() => {
        const box = holder.current
        if (!box) return
        const video = track.attach()
        video.className = "absolute inset-0 h-full w-full object-cover"
        box.append(video)
        return () => {
            track.detach(video)
            video.remove()
        }
    }, [track])
    return <span ref={holder} className="absolute inset-0 overflow-hidden rounded-lg" aria-hidden />
}

export function Lobby({
    data,
    meId,
    mc,
    hint,
    belowHint,
}: {
    data: LobbyData
    meId?: string | null
    mc?: {
        canStart: boolean
        busy?: boolean
        onStart: (roundId: string, phase?: 1 | 2) => void
        opensMatch?: boolean
        onEndMatch?: () => void
        endingMatch?: boolean
    }
    hint?: ReactNode
    belowHint?: ReactNode
}) {
    const selfCam = useSelfCam()
    const [confirmEnd, setConfirmEnd] = useState(false)

    let endable: (() => void) | undefined = undefined
    if (mc) endable = mc.onEndMatch
    if (data.status === "FINISHED") endable = undefined
    let endLabel = "Kết thúc trận đấu"
    if (mc?.endingMatch === true) endLabel = "Đang kết thúc…"


    return (
        <div className="absolute inset-0 flex flex-col items-center overflow-y-auto px-[4cqw] pt-[5cqw] text-center">
            <h1 className="font-display font-bold uppercase leading-none text-foreground" style={{ fontSize: "3cqw" }}>
                {data.title}
            </h1>
            <p className="mt-[1.2cqw] font-sans font-medium leading-none text-muted-foreground" style={{ fontSize: "1.4cqw" }}>
                {data.title} - {data.label}
            </p>

            
            <div className="mt-[3.2cqw] flex flex-wrap items-stretch justify-center gap-[1.2cqw]">
                {data.table.map((row) => {
                    const mine = Boolean(meId) && row.id === meId
                    let video: LocalVideoTrack | RemoteVideoTrack | null = row.video ?? null
                    if (video === null) {
                        if (mine) {
                            if (selfCam && selfCam.camOn) video = selfCam.video
                        }
                    }
                    let rowRing = ""
                    if (mine) rowRing = "ring-2 ring-sky-500"
                    return (
                        <div
                            key={row.id}
                            className={`flex h-[9.3cqw] w-[21cqw] shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl bg-card p-[0.9cqw] shadow-sm ring-1 ring-border ${rowRing}`}
                        >
                            <div className="flex min-h-0 flex-1 gap-[0.7cqw]">
                                <div
                                    className="relative flex w-[52%] shrink-0 items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                                    style={{ fontSize: pt(16) }}
                                >
                                    <span aria-hidden>
                                        {row.displayName.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"}
                                    </span>
                                    {video && <LobbyVideo track={video} />}
                                    {mine && <SelfCamControls />}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col justify-start gap-[0.3cqw] pt-[0.2cqw] text-center">
                                    <span className="truncate font-display font-semibold leading-none text-foreground" style={{ fontSize: pt(16) }}>
                                        {row.displayName}
                                    </span>
                                    <span className="font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(48) }}>
                                        {row.points}
                                    </span>
                                </div>
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

            {belowHint}


            {mc && data.rounds.length > 0 && (
                <div className="mt-[3cqw] flex flex-wrap items-center justify-center gap-[1cqw]">
                    {data.rounds.map((round, i) => {
                        const live =
                            (data.status === "LIVE" || Boolean(mc.opensMatch)) &&
                            Boolean(mc.canStart) &&
                            !mc.busy
                        const isCurrent =
                            data.roundId === round.id &&
                            (round.phase === undefined ||
                                data.currentPhase === round.phase ||
                                data.currentPhase === null ||
                                data.currentPhase === undefined)
                        let roundTitle = `Bắt đầu vòng ${round.name} (nhảy tới)`
                        if (isCurrent) {
                            roundTitle = `Bắt đầu vòng ${round.name}`
                            if (data.status !== "LIVE") {
                                if (mc.opensMatch) {
                                    roundTitle = `Bắt đầu vòng ${round.name} (mở trận cùng lúc)`
                                } else {
                                    roundTitle = "Trận chưa mở — bắt đầu ở trang trận"
                                }
                            }
                        }
                        if (round.status === "playing") {
                            roundTitle = `Mở lại vòng ${round.name} — trạng thái đã lưu`
                            if (isCurrent) roundTitle = `Quay lại vòng ${round.name} — đang dở`
                        }
                        if (round.status === "ended") {
                            roundTitle = `Mở lại vòng ${round.name} — trạng thái đã lưu`
                        }
                        let roundCls = "cursor-default bg-card text-muted-foreground"
                        if (live) roundCls = "cursor-pointer bg-card text-foreground hover:ring-primary"
                        let roundExtra = ""
                        if (live) {
                            if (mc.busy) roundExtra = "opacity-60"
                        }
                        return (
                            <button
                                key={`${round.id}:${round.name}:${i}`}
                                type="button"
                                disabled={!live}
                                onClick={() => mc.onStart(round.id, round.phase)}
                                title={roundTitle}
                                className={`rounded-[0.5cqw] px-[1.8cqw] py-[0.8cqw] font-sans font-semibold uppercase leading-none tracking-wide ring-1 ring-border transition ${roundCls} ${roundExtra}`}
                                style={{ fontSize: "1.2cqw" }}
                            >
                                {round.name}
                            </button>
                        )
                    })}
                </div>
            )}
            {endable && (
                <div className="mt-[3cqw] flex justify-center">
                    <button
                        type="button"
                        onClick={() => setConfirmEnd(true)}
                        disabled={mc?.endingMatch === true}
                        title="Chốt điểm và kết thúc trận — bảng xếp hạng cập nhật ngay"
                        className="rounded-[0.5cqw] border border-destructive/40 bg-destructive/10 px-[1.8cqw] py-[0.8cqw] font-sans font-semibold uppercase leading-none tracking-wide text-destructive transition hover:brightness-110 disabled:opacity-50"
                        style={{ fontSize: "1.2cqw" }}
                    >
                        {endLabel}
                    </button>
                </div>
            )}
            {confirmEnd && endable && (
                <Dialog open onOpenChange={(next) => { if (!next) setConfirmEnd(false) }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Kết thúc trận đấu?</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                            Trận sẽ được chốt kết quả và cập nhật bảng xếp hạng — kết quả đóng băng sau khi kết thúc.
                        </p>
                        <DialogFooter className="items-center gap-2">
                            <Button variant="outline" aria-label="Huỷ" title="Huỷ" onClick={() => setConfirmEnd(false)}>
                                <X className="size-4" aria-hidden />
                            </Button>
                            <Button
                                variant="destructive"
                                aria-label="Kết thúc trận"
                                title="Kết thúc trận"
                                disabled={mc?.endingMatch === true}
                                onClick={() => {
                                    setConfirmEnd(false)
                                    endable()
                                }}
                            >
                                Kết thúc trận đấu
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}

