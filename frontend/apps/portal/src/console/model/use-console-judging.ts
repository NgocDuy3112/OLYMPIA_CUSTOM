import { useState } from "react"
import { useQuestionAnswers, type ConsoleQuestion, type QuestionAnswerRow } from "@/lib/live"
import { judgingIdsOf, targetOf, type JudgingIds } from "../lib/judging"

type Picked = { qid: string | null; ids: ReadonlySet<string> }
const EMPTY_PICKS: ReadonlySet<string> = new Set()

export interface ConsoleJudging extends JudgingIds {
    rows: QuestionAnswerRow[]
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
    tournamentId: string
    matchId: string
    roundId: string
    questions: ConsoleQuestion[]
    openIds: readonly string[]
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

    const answers = useQuestionAnswers(input.tournamentId, input.matchId, ids.judgingId ?? ids.resolvingId)
    const rows = answers.data ?? []

    const selectedIds = picked.qid === ids.judgingId ? picked.ids : EMPTY_PICKS
    const target = targetOf(rows.map((r) => r.userId), selectedPlayer)

    const verdictOf = (questionId: string, userId: string): "CORRECT" | "INCORRECT" | null => {
        const key = `${questionId}:${userId}`
        if (key in overrides) return overrides[key] ? "CORRECT" : "INCORRECT"
        return rows.find((r) => r.userId === userId)?.verdict ?? null
    }

    const setVerdict = (correct: boolean) => {
        const qid = ids.judgingId ?? ids.resolvingId
        if (!qid) return
        // one press grades the whole ticked set; with nothing ticked it still
        // falls back to the single player the console is pointed at
        const targets = selectedIds.size > 0
            ? [...selectedIds]
            : target !== null ? [target] : []
        if (targets.length === 0) return
        setOverrides((o) => {
            const next = { ...o }
            for (const userId of targets) next[`${qid}:${userId}`] = correct
            return next
        })
    }

    const toggleSelect = (userId: string) =>
        setPicked((prev) => {
            const next = new Set(prev.qid === ids.judgingId ? prev.ids : EMPTY_PICKS)
            if (next.has(userId)) next.delete(userId)
            else next.add(userId)
            return { qid: ids.judgingId, ids: next }
        })

    return {
        ...ids,
        rows,
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
