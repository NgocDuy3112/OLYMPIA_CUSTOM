// The S2 question selector (khởi động phase 1: the player walks the twelve).
//
// A player may click any question of the batch; the remembered click is stored
// WITH its question id, so a question that closed simply stops matching and the
// clamped index takes over — no effect has to clear the selection.
//
// Pure: the same remembered click on the same batch always yields the same
// on-screen question, which is what keeps the square selector in sync with the
// card without a second source of truth.
import type { PlayerView } from "@shared/deck/types"

type Open = PlayerView["open"]
type OpenQuestion = Open[number]

/** The remembered click — `qid` is only trusted while it is still in the batch. */
export interface S2Selection {
    qid: string
    idx: number
}

export interface S2Question {
    /** the square to mark selected */
    idx: number
    /** the question to draw (undefined: the batch is empty) */
    question: OpenQuestion | undefined
}

/** Where the remembered qid sits in the batch, or -1 when it left. */
export function s2IndexOf(qid: string, open: Open): number {
    const found = open.findIndex((entry) => entry.questionId === qid)
    return found >= 0 ? found : -1
}

/**
 * The question on screen.
 *
 * S2 is a WALK: the remembered click wins while its question is still open, and
 * every other stage/question set falls back to the clamped index (a batch that
 * shrank must not point past its end).
 */
export function s2QuestionOf(input: {
    selection: S2Selection
    open: Open
    roundId: string
    stage: string
}): S2Question {
    const { selection, open, roundId, stage } = input
    const clamped = Math.min(selection.idx, Math.max(0, open.length - 1))
    const remembered = s2IndexOf(selection.qid, open)
    const isWalk = roundId === "khoi-dong" && stage === "phase2"
    if (isWalk && open[remembered] !== undefined) return { idx: remembered, question: open[remembered] }
    return { idx: clamped, question: open[clamped] }
}
