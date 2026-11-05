import { useQuery } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import type { PlayerCtx, PlayerView } from "@shared/deck/types"

// The AUDIENCE's data layer: one public read, no writes, no ledger, no mc.
//
// The payload is the console's shared PROJECTION (stage, question text, board,
// table, deadlines) with every answer stripped and the judge's extras withheld
// (see backend: audienceViewOf). The deck renders it as a view, exactly as a
// player's screen would — with an EMPTY observer `me`, so nothing on screen can
// claim to be this viewer's answer, buzz or power.

/** What `/spectate/.../live` returns: the projection, without a player slice. */
interface AudienceRead extends Omit<PlayerView, "me"> {
    roundEnded: boolean
}

const audienceKey = (tournamentId: string, matchId: string) =>
    ["audience", tournamentId, matchId] as const

export function useAudienceLive(tournamentId: string, matchId: string) {
    return useQuery({
        queryKey: audienceKey(tournamentId, matchId),
        queryFn: () =>
            api<AudienceRead>(`/spectate/tournaments/${tournamentId}/matches/${matchId}/live`),
        // A show is watched, not clicked: poll at the venue's pace and keep the
        // previous frame on screen while the next arrives (no flash to empty).
        refetchInterval: 2_000,
        placeholderData: (previous) => previous,
        retry: false,
        staleTime: 0,
    })
}

/** The same read, shaped as a PlayerView the shared screens can draw. */
export function audienceView(read: AudienceRead): PlayerView {
    return { ...read, me: {} }
}

// ── the read-only ctx ────────────────────────────────────────────────────────
// Every player screen takes `PlayerCore & { …its extras }`; an audience supplies
// the core and NO-OP handlers. Nothing can be sent from this surface — the
// `.audience` CSS strips the controls anyway — so a no-op is the honest default
// rather than a disabled button that pretends to exist.
const noop = () => {}

export function audienceCtx(view: PlayerView): PlayerCtx {
    return {
        v: view,
        stage: view.stage,
        open: view.open,
        remaining: 0,
        myId: null,
        flash: null,
        nameOf: (id) => view.table.find((row) => row.id === id)?.displayName ?? id,
        s2Q: view.open[0],
        s2Idx: 0,
        pickS2: noop,
        pickedCells: [],
        setPickedCells: noop,
        answerBusy: false,
        submitAnswer: noop,
        keywordBusy: false,
        submitKeyword: noop,
        cmdBusy: false,
        command: noop,
    }
}
