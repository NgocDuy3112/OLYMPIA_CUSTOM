import type { ConsoleFacts } from "@/components/stage/deck"
import { ButPhaAOCController, type ButPhaCtx } from "./ButPhaAOCController"
import { mergedVerdicts } from "@/lib/live"
import { screenCore, type RoundAction, type RoundModule, type RoundPlanInput } from "../types"



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

/** The open question's commit — the ledger's drafts need the console's verdicts. */
function finalizeIfNeeded(input: RoundPlanInput): RoundAction[] {
    if (input.openIds.length === 0) return []
    if (input.rows.length === 0 || !input.rows.some((row) => !row.judged)) return []
    const questionId = input.openIds[0]
    const verdicts = mergedVerdicts(questionId, input.rows, input.overrides)
    // Nothing staged → skip the commit entirely (an empty finalize is invalid);
    // the close/end guard that follows carries the UNJUDGED_ANSWERS refusal,
    // and a PARTIAL set is sent as-is — the backend refuses it too, so an
    // un-staged answer can never be silently judged.
    if (verdicts.length === 0) return []
    return [{ kind: "but-pha.finalize", questionId, verdicts }]
}

export const butPhaAOC: RoundModule = {
    render: (f) => <ButPhaAOCController ctx={butPhaCtx(f)} />,
    railVariant: () => "answers",
    // ONE press ends the round — the engine closes any open question with it.
    endRoundPlan: (input): RoundAction[] =>
        [...finalizeIfNeeded(input), { kind: "but-pha.endRound" }],
    // Tính giờ: commit the current question, advance, open the next. Closing
    // the last question ends the round (engine rule) — so no open after it.
    nextQuestionPlan: (input): RoundAction[] => {
        if (input.openIds.length === 0) return [{ kind: "but-pha.openQuestion" }]
        const isLastQuestion = (input.openQuestionPosition ?? TOTAL_QUESTIONS) >= TOTAL_QUESTIONS
        return [
            ...finalizeIfNeeded(input),
            { kind: "but-pha.closeQuestion" },
            // `as const`: through the ternary the literal widens to string and
            // the compiler can no longer see which action this is.
            ...(isLastQuestion ? [] : [{ kind: "but-pha.openQuestion" as const }]),
        ]
    },
}
