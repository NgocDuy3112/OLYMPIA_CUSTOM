// The PLAYER's model — every hook, gate fact and dispatch input the deck needs.
//
// Split out of `player-shell.tsx` (Phase 3): the shell used to be the hooks, the
// four gate branches, the lobby hint, the S2 selector, the flash and the whole
// `PlayerCtx` bag in one file. Now the shell is gates + one dispatch, and this
// is the only place a player-side hook is called.
//
// Transport = docs/live-surface.md § L3: HTTP up, socket down (lib/live). Every
// mutation is wrapped here so a screen never sees a mutation object — it sees
// `submitAnswer` / `buzz` / `command` and a busy flag.
import { useState, type ReactNode } from "react"
import { useCountdown } from "@shared/lib/clock"
import { isWaitingStage } from "@shared/deck/geometry"
import type { PlayerCtx } from "@shared/deck/player-deck"
import { roundModuleOf } from "@/rounds"
import {
    playerScreenOf,
    useLiveAnswer,
    useLiveBuzz,
    useLiveKeyword,
    useLiveLobby,
    useLiveMatch,
    useLivePlayerCommand,
    type AnswerValue,
    type LivePlayerCommand,
    type LiveView,
    type PlayerScreen,
} from "@/lib/live"
import { lobbyHintOf } from "@/lib/lobby-hint"
import { useMe } from "@/lib/session"

/** S2 selector: the remembered qid if it is still open, else -1 (the clamped index wins). */
function s2QIndex(qid: string, open: PlayerCtx["open"]): number {
    const found = open.findIndex((entry) => entry.questionId === qid)
    return found >= 0 ? found : -1
}

/** A refusal is a flash, not a crash — 409 means "the window moved on". */
function refusalOf(error: unknown): string | null {
    if (!error) return null
    if (error instanceof Error) return error.message
    return "Không gửi được — thử lại"
}

export interface PlayerModel {
    /** this player's identity (null until the session read lands) */
    myId: string | null
    /** the pushed view — undefined until the first read/push paints */
    v: LiveView | undefined
    /** the transport's status: 401/403/409 are ANSWERS the gates read */
    failureStatus: number | undefined
    failureMessage: string | undefined
    /** which screen the view routes to (lobby for unknown/ended rounds) */
    screen: PlayerScreen
    roundId: string
    /** why the lobby is showing (only meaningful when screen === "lobby") */
    lobbyHint: string
    /** the waiting room's payload, if it answered */
    lobby: ReturnType<typeof useLiveLobby>
    /** re-read the live state (the gates' retry button) */
    retry: () => void
    /**
     * Everything a round module renders from — null while there is no view.
     * The shell hands this straight to `roundModuleOf(roundId).render(ctx)`.
     */
    ctx: PlayerCtx | null
    /** the round module that draws this round (null: unknown round, lobby owns it) */
    render: ((ctx: PlayerCtx) => ReactNode) | null
}

export function usePlayerModel(matchId: string): PlayerModel {
    // ── hooks first — nothing below may early-return ─────────────────────────
    const me = useMe()
    const live = useLiveMatch(matchId, true)
    const answer = useLiveAnswer(matchId)
    // Khởi động chung: the buzz is that round's only player action (no payload).
    const buzzAction = useLiveBuzz(matchId)
    const keywordSubmit = useLiveKeyword(matchId)
    const cmd = useLivePlayerCommand(matchId)

    const [view2, setView2] = useState({ qid: "", idx: 0 })   // S2 question selector (derived reset)
    const [pickedCells, setPickedCells] = useState<string[]>([])  // ve-dich board picks

    const v = live.view
    const open = v?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, live.clock)
    const myId = me.data?.id ?? null

    // Waiting = no view yet (409: match not LIVE) or a round not running.
    // The lobby answers in BOTH cases — ask for it whenever that's true.
    const failureStatus = live.failure?.status
    const matchNotLiveYet = failureStatus === 409 // /live refuses until the match is LIVE
    const noViewToPaint = v === undefined          // the first read/push has not landed
    const roundNotRunning = isWaitingStage(live.view?.stage ?? "")
    const waiting = matchNotLiveYet || noViewToPaint || roundNotRunning
    const lobby = useLiveLobby(matchId, waiting)

    if (!v) {
        return {
            myId,
            v,
            failureStatus,
            failureMessage: live.failure?.message,
            screen: "lobby",
            roundId: "",
            lobbyHint: lobbyHintOf("", ""),
            lobby,
            retry: live.refetch,
            ctx: null,
            render: null,
        }
    }

    // ── derived facts (only meaningful once the view painted) ────────────────
    const roundId = v.roundId
    const stage = v.stage
    const screen = playerScreenOf(v)
    const flash = refusalOf(answer.error) ?? refusalOf(keywordSubmit.error) ?? refusalOf(cmd.error)
    const nameOf = (id: string) => v.table.find((row) => row.id === id)?.displayName ?? "Thí sinh"

    // S2: which of the batch is on screen (derived: drop a qid that closed)
    const s2Idx = Math.min(view2.idx, Math.max(0, open.length - 1))
    const s2Q = roundId === "khoi-dong" && stage === "phase2" && open[s2QIndex(view2.qid, open)] !== undefined
        ? open[s2QIndex(view2.qid, open)]
        : open[s2Idx]

    const submitAnswer = (questionId: string, value: AnswerValue) => answer.mutate({ questionId, value })
    const submitKeyword = (questionId: string, text: string) => keywordSubmit.mutate({ questionId, value: { text } })
    const command = (action: LivePlayerCommand) => cmd.mutate(action)

    const ctx: PlayerCtx = {
        v,
        stage,
        open,
        remaining,
        myId,
        flash,
        nameOf,
        s2Q,
        s2Idx,
        pickS2: (questionId: string, idx: number) => setView2({ qid: questionId, idx }),
        pickedCells,
        setPickedCells,
        answerBusy: answer.isPending,
        submitAnswer,
        buzzBusy: buzzAction.isPending,
        buzz: () => buzzAction.mutate({}),
        keywordBusy: keywordSubmit.isPending,
        submitKeyword,
        cmdBusy: cmd.isPending,
        command,
    }

    return {
        myId,
        v,
        failureStatus,
        failureMessage: live.failure?.message,
        screen,
        roundId,
        lobbyHint: lobbyHintOf(roundId, stage),
        lobby,
        retry: live.refetch,
        ctx,
        render: roundModuleOf(roundId)?.render ?? null,
    }
}
