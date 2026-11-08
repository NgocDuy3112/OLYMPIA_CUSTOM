import type { PlayerView } from "@shared/deck/types"

type Open = PlayerView["open"]
type OpenQuestion = Open[number]

export interface S2Selection {
    qid: string
    idx: number
}

export interface S2Question {
    idx: number
    question: OpenQuestion | undefined
}

export function s2IndexOf(qid: string, open: Open): number {
    const found = open.findIndex((entry) => entry.questionId === qid)
    return found >= 0 ? found : -1
}

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
