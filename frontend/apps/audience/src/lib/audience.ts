import { useQuery } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import type { PlayerCtx, PlayerView } from "@shared/deck/types"


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
        refetchInterval: 2_000,
        placeholderData: (previous) => previous,
        retry: false,
        staleTime: 0,
    })
}

export function audienceView(read: AudienceRead): PlayerView {
    return { ...read, me: {} }
}

const noop = () => {}

export function audienceCtx(view: PlayerView): PlayerCtx {
    return {
        v: view,
        stage: view.stage,
        open: view.open,
        remaining: 0,
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
