import { useQuery } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import { useCountdown, type ServerClock } from "@shared/lib/clock"
import { keepNewestRead } from "@shared/lib/view-version"
import type { PlayerCtx, PlayerView } from "@shared/deck/types"


interface AudienceRead extends Omit<PlayerView, "me"> {
    roundEnded: boolean
}

const audienceKey = (tournamentId: string, matchId: string) =>
    ["audience", tournamentId, matchId] as const

/**
 * The 2s poll can land behind the event stream that already moved the view on.
 * Mirror the stream's guard: a read older than the cached version never repaints
 * the LED. A read without a version is kept — it proves nothing.
 *
 * Shared with the deck's REST reads (gameplay/src/lib/live.ts) — one definition of
 * "the newer view wins".
 */
export { keepNewestRead }

export function useAudienceLive(tournamentId: string, matchId: string) {
    return useQuery({
        queryKey: audienceKey(tournamentId, matchId),
        queryFn: () =>
            api<AudienceRead>(`/spectate/tournaments/${tournamentId}/matches/${matchId}/live`),
        structuralSharing: (old, next) =>
            keepNewestRead(old as AudienceRead | undefined, next as AudienceRead),
        refetchInterval: 2_000,
        placeholderData: (previous) => previous,
        retry: false,
        staleTime: 0,
    })
}

export function audienceView(read: AudienceRead): PlayerView {
    return { ...read, me: { pickedTiles: [], hintVerdicts: {} } }
}

const noop = () => {}

/**
 * The LED has no clock handshake: spectate deadlines are absolute server times,
 * so the local clock is the only reference and the skew stays zero.
 */
const AUDIENCE_CLOCK: ServerClock = { sync: noop, skew: () => 0 }

export interface AudienceRemaining {
    remaining: number
    oralRemaining: number
}

/** The audience ticks its own countdown; refetching only refreshes the view. */
export function useAudienceCtx(view: PlayerView): PlayerCtx {
    const remaining = useCountdown(view.open[0]?.deadlineAt ?? null, AUDIENCE_CLOCK)
    const oralRemaining = useCountdown(view.oral?.deadlineAt ?? null, AUDIENCE_CLOCK)
    return audienceCtx(view, { remaining, oralRemaining })
}

export function audienceCtx(view: PlayerView, remaining: AudienceRemaining): PlayerCtx {
    return {
        v: view,
        stage: view.stage,
        open: view.open,
        remaining: remaining.remaining,
        oralRemaining: remaining.oralRemaining,
        clock: AUDIENCE_CLOCK,
        myId: null,
        audience: true,
        flash: null,
        nameOf: (id) => view.table.find((row) => row.id === id)?.displayName ?? id,
        s2Q: view.open[0],
        s2Idx: 0,
        pickS2: noop,
        answerBusy: false,
        submitAnswer: noop,
        keywordBusy: false,
        submitKeyword: noop,
        cmdBusy: false,
        command: noop,
    }
}
