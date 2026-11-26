import { useCountdown, useServerClock } from "@shared/lib/clock"
import { fetchOperatorRtcToken, useAudioGate, useHostBroadcast, useMediaPolicy, useRtcPeerControls, useRtcPeerTracks, useRtcRoom, type HostBroadcast, type RtcPeerControlsMap } from "@shared/lib/rtc"
import { useLive, useLiveAction, type ConsoleQuestion, type LiveResponse, type Projection } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"
import { collapseKeywordVerdicts } from "@/lib/live-actions"
import { useControllerHeartbeat } from "./use-controller-heartbeat"
import { useConsoleAssistant, type AssistantSurface } from "./use-console-assistant"

export interface ConsoleTransport {
    clock: ReturnType<typeof useServerClock>
    live: ReturnType<typeof useLive>
    writer: ReturnType<typeof useLiveAction>
    scoreWriter: ReturnType<typeof useLiveAction>
    sendScore: (action: LiveAction) => Promise<void>
    v: LiveResponse | undefined
    projection: Projection | undefined
    roundId: string
    stage: string
    open: Projection["open"]
    remaining: number | null
    keywordRemaining: number | null
    oralRemaining: number | null
    userSeats: string[]
    questions: ConsoleQuestion[]
    table: Projection["table"]
    byId: (id: string) => ConsoleQuestion | null
    peers: ReturnType<typeof useRtcPeerTracks>
    peerControls: RtcPeerControlsMap
    host: HostBroadcast
    assistant: AssistantSurface
    send: (action: LiveAction) => void
    sendChain: (actions: LiveAction[]) => Promise<void>
    flash: string | null
}

export function useConsoleTransport(tournamentId: string, matchId: string): ConsoleTransport {
    const clock = useServerClock()
    const writer = useLiveAction(tournamentId, matchId)
    const chainWriter = useLiveAction(tournamentId, matchId)
    const scoreWriter = useLiveAction(tournamentId, matchId)
    const send = (action: LiveAction) => writer.mutate(action)
    const heartbeatError = useControllerHeartbeat(tournamentId, matchId)
    const assistant = useConsoleAssistant(send)
    const live = useLive(tournamentId, matchId, clock.sync, assistant.ingest)

    const v = live.data
    const projection = v?.projection
    const open = projection?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, clock)
    const keywordRemaining = useCountdown(projection?.keywordDeadlineAt ?? null, clock)
    const oralRemaining = useCountdown(projection?.oral?.deadlineAt ?? null, clock)
    const questions = v?.questions ?? []

    const rtc = useRtcRoom({
        enabled: true,
        autoSubscribe: true,
        getToken: () =>
            fetchOperatorRtcToken(tournamentId, matchId),
    })
    const peers = useRtcPeerTracks(rtc.room)
    const peerControls = useRtcPeerControls(rtc.room)
    const host = useHostBroadcast(rtc.room)
    useAudioGate(rtc.room, projection?.audioGate)
    useMediaPolicy(rtc.room, projection?.mediaPolicy)

    const sendChain = async (actions: LiveAction[]) => {
        for (const action of collapseKeywordVerdicts(actions)) {
            try {
                await chainWriter.mutateAsync(action)
            } catch {
                return
            }
        }
    }

    const sendScore = async (action: LiveAction) => {
        await scoreWriter.mutateAsync(action)
    }

    const userSeats = (projection?.table ?? []).map((row) => row.id)

    let flash: string | null = null
    if (heartbeatError !== null) flash = heartbeatError
    else if (writer.isError) {
        flash = (writer.error as { message?: string } | null)?.message ?? "Trạng thái đã đổi — đã tải lại"
    } else if (chainWriter.isError) {
        flash = (chainWriter.error as { message?: string } | null)?.message ?? "Trạng thái đã đổi — đã tải lại"
    } else if (scoreWriter.isError) {
        flash = (scoreWriter.error as { message?: string } | null)?.message ?? "Trạng thái đã đổi — đã tải lại"
    }

    return {
        clock,
        live,
        writer,
        scoreWriter,
        sendScore,
        v,
        projection,
        roundId: v?.roundId ?? "",
        stage: projection?.stage ?? "pending",
        open,
        remaining,
        keywordRemaining,
        oralRemaining,
        userSeats,
        questions,
        table: projection?.table ?? [],
        byId: (id) => questions.find((q) => q._id === id) ?? null,
        peers,
        peerControls,
        host,
        assistant,
        send,
        sendChain,
        flash,
    }
}
