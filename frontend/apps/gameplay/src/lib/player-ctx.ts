import type { PlayerCtx, PlayerView } from "@shared/deck/types"
import type { AnswerValue, LivePlayerCommand } from "@/lib/live"
import type { S2Question } from "./s2"

interface PlayerCtxParts {
    v: PlayerView
    stage: string
    remaining: number
    myId: string | null
    flash: string | null
    selection: S2Question
    pickS2: (questionId: string, idx: number) => void
    answer: { busy: boolean; submit: (questionId: string, value: AnswerValue) => void }
    keyword: { busy: boolean; submit: (questionId: string, text: string) => void }
    cmd: { busy: boolean; run: (action: LivePlayerCommand) => void }
}

function nameOfIn(view: PlayerView, id: string): string {
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
        answerBusy: parts.answer.busy,
        submitAnswer: parts.answer.submit,
        keywordBusy: parts.keyword.busy,
        submitKeyword: parts.keyword.submit,
        cmdBusy: parts.cmd.busy,
        command: parts.cmd.run,
    }
}
