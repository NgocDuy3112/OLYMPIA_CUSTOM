import { useState, type ReactNode } from "react"
import { useCountdown } from "@shared/lib/clock"
import { isWaitingStage } from "@shared/deck/geometry"
import type { PlayerCtx } from "@shared/deck/player-deck"
import { roundModuleOf } from "@/rounds"
import {
    playerScreenOf,
    useLiveAnswer,
    useLiveKeyword,
    useLiveLobby,
    useLiveMatch,
    useLivePlayerCommand,
    type AnswerValue,
    type LivePlayerCommand,
    type LiveView,
    type PlayerScreen,
} from "@/lib/live"
import { flashOf } from "@/lib/flash"
import { lobbyHintOf } from "@/lib/lobby-hint"
import { playerCtxOf } from "@/lib/player-ctx"
import { s2QuestionOf } from "@/lib/s2"
import { useMe } from "@/lib/session"

export interface PlayerModel {
    myId: string | null
    v: LiveView | undefined
    failureStatus: number | undefined
    failureMessage: string | undefined
    screen: PlayerScreen
    roundId: string
    lobbyHint: string
    lobby: ReturnType<typeof useLiveLobby>
    retry: () => void
    ctx: PlayerCtx | null
    render: ((ctx: PlayerCtx) => ReactNode) | null
}

export function usePlayerModel(matchId: string): PlayerModel {
    const me = useMe()
    const live = useLiveMatch(matchId, true)
    const answer = useLiveAnswer(matchId)
    const keywordSubmit = useLiveKeyword(matchId)
    const cmd = useLivePlayerCommand(matchId)

    const [view2, setView2] = useState({ qid: "", idx: 0 })       

    const v = live.view
    const open = v?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, live.clock)
    const myId = me.data?.id ?? null

    const failureStatus = live.failure?.status
    const matchNotLiveYet = failureStatus === 409
    const noViewToPaint = v === undefined
    const roundNotRunning = isWaitingStage(v?.stage ?? "")
    const lobby = useLiveLobby(matchId, matchNotLiveYet || noViewToPaint || roundNotRunning)

    const base = {
        myId,
        v,
        failureStatus,
        failureMessage: live.failure?.message,
        lobby,
        retry: live.refetch,
    }
    if (!v) {
        return { ...base, screen: "lobby", roundId: "", lobbyHint: lobbyHintOf("", ""), ctx: null, render: null }
    }

    const roundId = v.roundId
    const stage = v.stage
    const selection = s2QuestionOf({ selection: view2, open, roundId, stage })
    const flash = flashOf(answer.error, keywordSubmit.error, cmd.error)

    const ctx = playerCtxOf({
        v,
        stage,
        remaining,
        myId,
        flash,
        selection,
        pickS2: (questionId: string, idx: number) => setView2({ qid: questionId, idx }),
        answer: {
            busy: answer.isPending,
            submit: (questionId: string, value: AnswerValue) => answer.mutate({ questionId, value }),
        },
        keyword: {
            busy: keywordSubmit.isPending,
            submit: (questionId: string, text: string) => keywordSubmit.mutate({ questionId, value: { text } }),
        },
        cmd: { busy: cmd.isPending, run: (action: LivePlayerCommand) => cmd.mutate(action) },
    })

    return {
        ...base,
        screen: playerScreenOf(v),
        roundId,
        lobbyHint: lobbyHintOf(roundId, stage),
        ctx,
        render: roundModuleOf(roundId)?.render ?? null,
    }
}
