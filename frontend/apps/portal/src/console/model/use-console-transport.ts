import { useCountdown, useServerClock } from "@shared/lib/clock"
import { fetchOperatorRtcToken, useAudioGate, useHostBroadcast, useRtcPeerTracks, useRtcRoom, type HostBroadcast } from "@shared/lib/rtc"
import { useLive, useLiveAction, type ConsoleQuestion, type LiveResponse, type Projection } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"
import { useMatches } from "@/lib/tournament"

export interface ConsoleTransport {
    clock: ReturnType<typeof useServerClock>
    live: ReturnType<typeof useLive>
    writer: ReturnType<typeof useLiveAction>
    v: LiveResponse | undefined
    projection: Projection | undefined
    roundId: string
    stage: string
    open: Projection["open"]
    remaining: number | null
    userSeats: string[]
    questions: ConsoleQuestion[]
    table: Projection["table"]
    byId: (id: string) => ConsoleQuestion | null
    peers: ReturnType<typeof useRtcPeerTracks>
    host: HostBroadcast
    send: (action: LiveAction) => void
    sendChain: (actions: LiveAction[]) => Promise<void>
    flash: string | null
}

export function useConsoleTransport(tournamentId: string, matchId: string): ConsoleTransport {
    const clock = useServerClock()
    const live = useLive(tournamentId, matchId, clock.sync)
    const matches = useMatches(tournamentId)
    const writer = useLiveAction(tournamentId, matchId)

    const v = live.data
    const projection = v?.projection
    const open = projection?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, clock)
    const questions = v?.questions ?? []

    const rtc = useRtcRoom({
        enabled: true,
        autoSubscribe: true,
        getToken: () =>
            fetchOperatorRtcToken(tournamentId, matchId),
    })
    const peers = useRtcPeerTracks(rtc.room)
    const host = useHostBroadcast(rtc.room)
    useAudioGate(rtc.room, projection?.audioGate)

    const send = (action: LiveAction) =>
        writer.mutate({ expectedVersion: v!.version, action })

    const sendChain = async (actions: LiveAction[]) => {
        let ver = v!.version
        for (const action of actions) {
            try {
                const res = await writer.mutateAsync({ expectedVersion: ver, action })
                if (typeof res?.version === "number") {
                    ver = res.version
                } else {
                    ver = ver + 1
                }
            } catch {
                return 
            }
        }
    }

    const userSeats = (matches.data?.items.find((m) => m.id === matchId)?.players ?? [])
        .flatMap((seat) => {
            if (!("userId" in seat)) return []
            if (!seat.userId) return []
            return [seat.userId]
        })

    let flash: string | null = null
    if (writer.isError) {
        flash = (writer.error as { message?: string } | null)?.message ?? "Trạng thái đã đổi — đã tải lại"
    }

    return {
        clock,
        live,
        writer,
        v,
        projection,
        roundId: v?.roundId ?? "",
        stage: projection?.stage ?? "pending",
        open,
        remaining,
        userSeats,
        questions,
        table: projection?.table ?? [],
        byId: (id) => questions.find((q) => q._id === id) ?? null,
        peers,
        host,
        send,
        sendChain,
        flash,
    }
}
