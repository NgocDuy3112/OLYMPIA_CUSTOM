import type { ConsoleFacts } from "@/components/stage/deck"
import { ButPhaOC4Controller, type ButPhaCtx } from "./ButPhaOC4Controller"
import { mergedVerdicts } from "@/lib/live"
import { screenCore, type RoundAction, type RoundModule, type RoundPlanInput } from "../types"

// Bứt phá — the OC4 ruleset: FOUR typed questions, each against its own clock.
// Tính giờ picks the NEXT question (commit the current ledger, advance the
// cursor, open the next — the engine auto-ends after the fourth). Kết thúc ends
// the round in ONE press: commit whatever is open, then end. The exit button
// never touches the question lifecycle.

const TOTAL_QUESTIONS = 4

function butPhaCtx(f: ConsoleFacts): ButPhaCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        pickQuestion: f.pickQuestion,
        target: f.target,
        setVerdict: f.setVerdict,
        setSelectedPlayer: f.setSelectedPlayer,
        byId: f.byId,
    }
}

/** The open question's commit — the ledger's drafts need the MC's verdicts. */
function finalizeIfNeeded(input: RoundPlanInput): RoundAction[] {
    if (input.openIds.length === 0) return []
    if (input.rows.length === 0 || !input.rows.some((row) => !row.judged)) return []
    const questionId = input.openIds[0]
    return [{
        kind: "but-pha.finalize",
        questionId,
        verdicts: mergedVerdicts(questionId, input.rows, input.overrides),
    }]
}

export const butPhaOc4: RoundModule = {
    render: (f) => <ButPhaOC4Controller ctx={butPhaCtx(f)} />,
    railVariant: () => "answers",
    // ONE press ends the round — the engine closes any open question with it.
    ketThucPlan: (input): RoundAction[] =>
        [...finalizeIfNeeded(input), { kind: "but-pha.endRound" }],
    // Tính giờ: commit the current question, advance, open the next. Closing
    // the last question ends the round (engine rule) — so no open after it.
    nextQuestionPlan: (input): RoundAction[] => {
        if (input.openIds.length === 0) return [{ kind: "but-pha.openQuestion" }]
        const isLastQuestion = (input.openQuestionPosition ?? TOTAL_QUESTIONS) >= TOTAL_QUESTIONS
        return [
            ...finalizeIfNeeded(input),
            { kind: "but-pha.closeQuestion" },
            ...(isLastQuestion ? [] : [{ kind: "but-pha.openQuestion" }]),
        ]
    },
}
