// The PLAYER's model — every hook, gate fact and dispatch input the deck needs.
//
// Split out of `player-shell.tsx` (Phase 3): the shell used to be the hooks, the
// four gate branches, the lobby hint, the S2 selector, the flash and the whole
// `PlayerCtx` bag in one file. Now the shell is gates + one dispatch, and this
// is the only place a player-side hook is called.
//
// What is pure lives in `lib/`: `s2` (which question is on screen), `flash` (the
// refusal line), `player-ctx` (the bag's assembly), `player-gate` (which stuck
// screen), `lobby-hint` (why the lobby). What is left here is hooks and wiring.
//
// Transport = docs/live-surface.md § L3: HTTP up, socket down (lib/live).
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
import { flashOf } from "@/lib/flash"
import { lobbyHintOf } from "@/lib/lobby-hint"
import { playerCtxOf } from "@/lib/player-ctx"
import { s2QuestionOf } from "@/lib/s2"
import { useMe } from "@/lib/session"

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
    /** everything a round module renders from — null while there is no view */
    ctx: PlayerCtx | null
    /** the round module that draws this round (null: unknown round, lobby owns it) */
    render: ((ctx: PlayerCtx) => ReactNode) | null
}

export function usePlayerModel(matchId: string): PlayerModel {
    // ── hooks first — nothing below may early-return ─────────────────────────
    const me = useMe()
    const live = useLiveMatch(matchId, true)
    const answer = useLiveAnswer(matchId)
    const buzzAction = useLiveBuzz(matchId)
    const keywordSubmit = useLiveKeyword(matchId)
    const cmd = useLivePlayerCommand(matchId)

    const [view2, setView2] = useState({ qid: "", idx: 0 })       // the S2 walk's remembered click
    const [pickedCells, setPickedCells] = useState<string[]>([])  // ve-dich board picks

    const v = live.view
    const open = v?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, live.clock)
    const myId = me.data?.id ?? null

    // Waiting = no view yet (409: the match is not LIVE) or a round not running.
    // The lobby answers in BOTH cases — ask for it whenever that's true.
    const failureStatus = live.failure?.status
    const matchNotLiveYet = failureStatus === 409
    const noViewToPaint = v === undefined
    const roundNotRunning = isWaitingStage(v?.stage ?? "")
    const lobby = useLiveLobby(matchId, matchNotLiveYet || noViewToPaint || roundNotRunning)

    // The gate facts are the same with or without a view; only ctx/render differ.
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

    // ── derived facts (only meaningful once the view painted) ────────────────
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
        pickedCells,
        setPickedCells,
        answer: {
            busy: answer.isPending,
            submit: (questionId: string, value: AnswerValue) => answer.mutate({ questionId, value }),
        },
        buzz: { busy: buzzAction.isPending, fire: () => buzzAction.mutate({}) },
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
