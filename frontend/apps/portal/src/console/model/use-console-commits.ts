// giai-ma's two COMMITS — the only place the round judges in bulk.
//
// Every commit judges ALL submitters of the current question in one go
// (selected = correct, the rest = wrong), so a coverage check can never refuse
// it and the round never strands an unjudged draft. That is why the hint window
// takes one action and the keyword drafts take one action PER PLAYER.
//
// The two readiness flags are the screen's business (they disable the buttons),
// so they live beside the commits rather than in the deck facts.
import type { LiveAction } from "@/lib/live-actions"
import type { QuestionAnswerRow } from "@/lib/live"

export interface ConsoleCommits {
    /** players are selected ON the current hint window — the commit may fire */
    commitHintReady: boolean
    /** players are selected on the keyword drafts (no window open) */
    commitKeywordReady: boolean
    /** resolve the open hint window with verdicts for every submitter */
    commitHint: () => void
    /** judge the keyword drafts, one action per submitter */
    commitKeyword: () => void
}

export interface CommitInput {
    roundId: string
    /** the anchor question's answers */
    rows: QuestionAnswerRow[]
    /** how many questions are open (a hint window is open when > 0) */
    openCount: number
    judgingId: string | null
    keywordQuestionId: string | null
    /** giai-ma's multi-select — the CORRECT ones */
    selectedIds: ReadonlySet<string>
    send: (action: LiveAction) => void
    sendChain: (actions: LiveAction[]) => Promise<void>
}

export function useConsoleCommits(input: CommitInput): ConsoleCommits {
    const { roundId, rows, openCount, judgingId, keywordQuestionId, selectedIds } = input
    const isGiaiMa = roundId === "giai-ma"
    // Commits are ready when a selected player actually SUBMITTED the current
    // question — hint commit needs a window, keyword commit needs none.
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
