// The console's JUDGING block: what the operator picks, what they staged, and
// what the anchor question's answers are.
//
// Split out of `useConsoleModel` because these four things move together and
// nothing else needs them: the picked question, the picked player, the staged
// verdict overrides, and the giai-ma multi-select. The round modules never see
// this — they read the slice inside `ConsoleFacts`.
//
// WHY ONE HOOK: the ids come from a pure table (`lib/judging`), the rows come
// from the query those ids point at, and the target/selected-set derive from
// the rows. Splitting them further would mean passing `rows` down or hoisting
// the query into the composer — a cycle for a file that is ~90 lines.
import { useState } from "react"
import { useQuestionAnswers, type ConsoleQuestion, type QuestionAnswerRow } from "@/lib/live"
import { judgingIdsOf, targetOf, type JudgingIds } from "../lib/judging"

// giai-ma's multi-select: the clicked player ids, plus the question they were
// clicked on — the scope is what makes a stale selection unreadable instead of
// needing an effect to clear it.
type Picked = { qid: string | null; ids: ReadonlySet<string> }
const EMPTY_PICKS: ReadonlySet<string> = new Set()

export interface ConsoleJudging extends JudgingIds {
    /** the anchor question's answer rows (empty while the query is in flight) */
    rows: QuestionAnswerRow[]
    /** staged verdicts, keyed `qid:uid` — committed by the round's end plan */
    overrides: Record<string, boolean>
    selectedQ: string | null
    setSelectedQ: (questionId: string | null) => void
    selectedPlayer: string | null
    setSelectedPlayer: (userId: string) => void
    /** giai-ma's multi-select, valid only for the CURRENT judging question */
    selectedIds: ReadonlySet<string>
    /** the verdict target: the clicked card if it answered, else the first answerer */
    target: string | null
    /** staged override first, else the submitted row's verdict */
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    /** stage a verdict for the target (the round's end plan commits it) */
    setVerdict: (correct: boolean) => void
    /** giai-ma: click toggles membership — selected = correct, the rest = wrong */
    toggleSelect: (userId: string) => void
}

export interface JudgingScopeInput {
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

    // One question of truth for "which question is the console reading".
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
        if (!qid || !target) return
        setOverrides((o) => ({ ...o, [`${qid}:${target}`]: correct }))
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
