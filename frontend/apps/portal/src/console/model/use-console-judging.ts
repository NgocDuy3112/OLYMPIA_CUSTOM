import { useState } from "react"
import { judgingIdsOf, targetOf, type JudgingIds } from "@/console/lib/judging"
import { type ConsoleQuestion, type QuestionAnswerRow } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"

type Picked = { qid: string | null; ids: ReadonlySet<string> }
const EMPTY_PICKS: ReadonlySet<string> = new Set()

export interface ConsoleJudging extends JudgingIds {
    rows: QuestionAnswerRow[]
    keywordRows: QuestionAnswerRow[]
    overrides: Record<string, boolean>
    selectedQ: string | null
    setSelectedQ: (questionId: string | null) => void
    selectedPlayer: string | null
    setSelectedPlayer: (userId: string) => void
    selectedIds: ReadonlySet<string>
    target: string | null
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    setVerdict: (correct: boolean) => void
    toggleSelect: (userId: string) => void
}

interface JudgingScopeInput {
    roundId: string
    questions: ConsoleQuestion[]
    openIds: readonly string[]
    answerRows: QuestionAnswerRow[]
    send: (action: LiveAction) => void
}

export function useConsoleJudging(input: JudgingScopeInput): ConsoleJudging {
    const [overrides, setOverrides] = useState<Record<string, boolean>>({})
    const [selectedQ, setSelectedQ] = useState<string | null>(null)
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
    const [picked, setPicked] = useState<Picked>(() => ({ qid: null, ids: EMPTY_PICKS }))

    const ids = judgingIdsOf({
        roundId: input.roundId,
        questions: input.questions,
        openIds: input.openIds,
        selectedQ,
    })

    const railQ = ids.judgingId ?? ids.resolvingId
    const rows = input.answerRows.filter((row) => row.questionId === railQ)
    const keywordRows = input.answerRows.filter((row) => row.questionId === ids.keywordQuestionId)

    let selectedIds: ReadonlySet<string> = EMPTY_PICKS
    if (picked.qid === ids.judgingId) selectedIds = picked.ids
    const target = targetOf(rows.map((r) => r.userId), selectedPlayer)

    const verdictOf = (questionId: string, userId: string): "CORRECT" | "INCORRECT" | null => {
        const key = `${questionId}:${userId}`
        if (key in overrides) {
            if (overrides[key]) return "CORRECT"
            return "INCORRECT"
        }
        return rows.find((r) => r.userId === userId)?.verdict ?? null
    }

    const setVerdict = (correct: boolean) => {
        const qid = ids.judgingId ?? ids.resolvingId
        if (!qid) return
        let targets: string[] = []
        if (selectedIds.size > 0) {
            targets = [...selectedIds]
        } else {
            if (target !== null) targets = [target]
        }
        if (targets.length === 0) return
        setOverrides((o) => {
            const next = { ...o }
            for (const userId of targets) next[`${qid}:${userId}`] = correct
            return next
        })

        if (input.roundId !== "but-pha") return
        const verdicts = targets.map((playerId) => ({ playerId, correct }))
        input.send({ kind: "but-pha.finalize", questionId: qid, verdicts })
    }

    const toggleSelect = (userId: string) =>
        setPicked((prev) => {
            let base: ReadonlySet<string> = EMPTY_PICKS
            if (prev.qid === ids.judgingId) base = prev.ids
            const next = new Set(base)
            if (next.has(userId)) next.delete(userId)
            else next.add(userId)
            return { qid: ids.judgingId, ids: next }
        })

    return {
        ...ids,
        rows,
        keywordRows,
        overrides,
        selectedQ,
        setSelectedQ,
        selectedPlayer,
        setSelectedPlayer,
        selectedIds,
        target,
        verdictOf,
        setVerdict,
        toggleSelect,
    }
}
