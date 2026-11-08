import type { LiveAction } from "@/lib/live-actions"
import type { QuestionAnswerRow } from "@/lib/live"

export interface ConsoleCommits {
    commitHintReady: boolean
    commitKeywordReady: boolean
    commitHint: () => void
    commitKeyword: () => void
}

interface CommitInput {
    roundId: string
    rows: QuestionAnswerRow[]
    openCount: number
    judgingId: string | null
    keywordQuestionId: string | null
    selectedIds: ReadonlySet<string>
    send: (action: LiveAction) => void
    sendChain: (actions: LiveAction[]) => Promise<void>
}

export function useConsoleCommits(input: CommitInput): ConsoleCommits {
    const { roundId, rows, openCount, judgingId, keywordQuestionId, selectedIds } = input
    const isGiaiMa = roundId === "giai-ma"
    const selectedOnQuestion = rows.some((r) => selectedIds.has(r.userId))

    const commitHintReady = isGiaiMa && openCount > 0 && selectedOnQuestion
    const commitKeywordReady = isGiaiMa && openCount === 0 && selectedOnQuestion

    const commitHint = () => {
        if (!commitHintReady || !judgingId) return
        input.send({
            kind: "giai-ma.resolveHint",
            verdicts: rows.map((r) => ({
                playerId: r.userId,
                correct: selectedIds.has(r.userId),
            })),
        })
    }

    const commitKeyword = () => {
        if (!commitKeywordReady || !keywordQuestionId) return
        const actions: LiveAction[] = rows.map((r) => ({
            kind: "giai-ma.judgeKeyword",
            playerId: r.userId,
            questionId: keywordQuestionId,
            correct: selectedIds.has(r.userId),
        }))
        void input.sendChain(actions)
    }

    return { commitHintReady, commitKeywordReady, commitHint, commitKeyword }
}
