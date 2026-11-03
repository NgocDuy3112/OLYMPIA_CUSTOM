// The console's TRANSPORT — everything that talks to the backend, in one hook.
//
// HTTP up / socket down (docs/live-surface.md): the live read + its push, the
// match seats, the action writer, and the operator's camera Room. The rest of
// the model never touches a query — it reads the snapshot this returns and
// sends through `send`/`sendChain`, which thread the engine's version so two
// clicks can never fight over stale state.
import { useCountdown, useServerClock } from "@shared/lib/clock"
import { fetchOperatorRtcToken, useRtcPeerTracks, useRtcRoom } from "@shared/lib/rtc"
import { useLive, useLiveAction, type ConsoleQuestion, type LiveResponse, type Projection } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"
import { useMatches } from "@/lib/tournament"

export interface ConsoleTransport {
    clock: ReturnType<typeof useServerClock>
    live: ReturnType<typeof useLive>
    writer: ReturnType<typeof useLiveAction>
    /** the snapshot (undefined before the first read/push paints) */
    v: LiveResponse | undefined
    projection: Projection | undefined
    /** "" while nothing has landed — `isKnownRound` decides what to draw */
    roundId: string
    /** "pending" while nothing has landed */
    stage: string
    /** the open questions, in the engine's order */
    open: Projection["open"]
    /** ms left on the first open question, from the server-anchored clock */
    remaining: number | null
    /** the seated user ids (the navigator's start payload) */
    userSeats: string[]
    questions: ConsoleQuestion[]
    table: Projection["table"]
    byId: (id: string) => ConsoleQuestion | null
    /** the players' live cameras, by user id */
    peers: ReturnType<typeof useRtcPeerTracks>
    /** version-guarded action sender */
    send: (action: LiveAction) => void
    /** Sequential actions, each carrying the version the previous one returned. */
    sendChain: (actions: LiveAction[]) => Promise<void>
    /** the writer's refusal, as the Status slots show it */
    flash: string | null
}

export function useConsoleTransport(tournamentId: string, matchId: string): ConsoleTransport {
    const clock = useServerClock()
    // The socket pushes re-anchor the clock (each frame carries the server's `at`).
    const live = useLive(tournamentId, matchId, clock.sync)
    const matches = useMatches(tournamentId)
    const writer = useLiveAction(tournamentId, matchId)

    const v = live.data
    const projection = v?.projection
    const open = projection?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, clock)
    const questions = v?.questions ?? []

    const rtc = useRtcRoom({
        enabled: Boolean(v),
        autoSubscribe: true,
        // The spectator has no portal session — its door is the public viewer
        // token (video only: Discord carries the show's audio).
        getToken: () =>
            // One surface now: the console always dials the operator's door.
            fetchOperatorRtcToken(tournamentId, matchId),
    })
    const peers = useRtcPeerTracks(rtc.room)

    const send = (action: LiveAction) =>
        writer.mutate({ expectedVersion: v!.version, action })

    const sendChain = async (actions: LiveAction[]) => {
        let ver = v!.version
        for (const action of actions) {
            try {
                const res = await writer.mutateAsync({ expectedVersion: ver, action })
                ver = typeof res?.version === "number" ? res.version : ver + 1
            } catch {
                return // onError already invalidated + set the refusal flash
            }
        }
    }

    const userSeats = (matches.data?.items.find((m) => m.id === matchId)?.players ?? [])
        .flatMap((seat) => ("userId" in seat && seat.userId ? [seat.userId] : []))

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
        send,
        sendChain,
        flash: writer.isError
            ? (writer.error as { message?: string } | null)?.message ?? "Trạng thái đã đổi — đã tải lại"
            : null,
    }
}
