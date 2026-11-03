// Assembling `PlayerCtx` — the one place the player deck's contract is filled in.
//
// Every round module renders from this bag, so this file is the seam between
// "the model knows it" and "the screen may see it". The mutations arrive as
// small { busy, call } pairs on purpose: a screen must never hold a mutation
// object (and its cache internals), only the call and whether it is in flight.
//
// Pure: same parts, same ctx. That is what lets `screens.test.tsx` render a
// screen from a literal ctx without mounting the transport.
import type { Dispatch, SetStateAction } from "react"
import type { PlayerCtx, PlayerView } from "@shared/deck/types"
import type { AnswerValue, LivePlayerCommand } from "@/lib/live"
import type { S2Question } from "./s2"

export interface PlayerCtxParts {
    v: PlayerView
    stage: string
    /** ms left on the first open question */
    remaining: number
    myId: string | null
    /** the refusal line for the Status slot */
    flash: string | null
    /** the S2 walk's on-screen question + marked square */
    selection: S2Question
    pickS2: (questionId: string, idx: number) => void
    /** ve-dich board picks (the screen derives toggle/confirm) */
    pickedCells: string[]
    setPickedCells: Dispatch<SetStateAction<string[]>>
    answer: { busy: boolean; submit: (questionId: string, value: AnswerValue) => void }
    /** khởi động chung: the buzz is that round's only action (no payload) */
    buzz: { busy: boolean; fire: () => void }
    keyword: { busy: boolean; submit: (questionId: string, text: string) => void }
    cmd: { busy: boolean; run: (action: LivePlayerCommand) => void }
}

/** A seat's display name, or the neutral fallback the deck shows before a read. */
export function nameOfIn(view: PlayerView, id: string): string {
    return view.table.find((row) => row.id === id)?.displayName ?? "Thí sinh"
}

export function playerCtxOf(parts: PlayerCtxParts): PlayerCtx {
    const { v } = parts
    return {
        v,
        stage: parts.stage,
        open: v.open,
        remaining: parts.remaining,
        myId: parts.myId,
        flash: parts.flash,
        nameOf: (id: string) => nameOfIn(v, id),
        s2Q: parts.selection.question,
        s2Idx: parts.selection.idx,
        pickS2: parts.pickS2,
        pickedCells: parts.pickedCells,
        setPickedCells: parts.setPickedCells,
        answerBusy: parts.answer.busy,
        submitAnswer: parts.answer.submit,
        buzzBusy: parts.buzz.busy,
        buzz: parts.buzz.fire,
        keywordBusy: parts.keyword.busy,
        submitKeyword: parts.keyword.submit,
        cmdBusy: parts.cmd.busy,
        command: parts.cmd.run,
    }
}
