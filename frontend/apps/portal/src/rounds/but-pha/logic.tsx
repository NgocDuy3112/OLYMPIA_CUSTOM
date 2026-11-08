import type { ConsoleFacts } from "@/components/stage/deck"
import { ButPhaAOCController, type ButPhaCtx } from "./ButPhaAOCController"
import { mergedVerdicts, type ButPhaConsole } from "@/lib/live"
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
        consoleButPha: (f.v.console ?? null) as ButPhaConsole | null,
    }
}

function finalizeIfNeeded(input: RoundPlanInput): RoundAction[] {
    if (input.openIds.length === 0) return []
    if (input.rows.length === 0 || !input.rows.some((row) => !row.judged)) return []
    const questionId = input.openIds[0]
    const verdicts = mergedVerdicts(questionId, input.rows, input.overrides)
    if (verdicts.length === 0) return []
    return [{ kind: "but-pha.finalize", questionId, verdicts }]
}

export const butPhaAOC: RoundModule = {
    render: (f) => <ButPhaAOCController ctx={butPhaCtx(f)} />,
    railVariant: () => "answers",
    endRoundPlan: (input): RoundAction[] =>
        [...finalizeIfNeeded(input), { kind: "but-pha.endRound" }],
    nextQuestionPlan: (input): RoundAction[] => {
        if (input.openIds.length === 0) return [{ kind: "but-pha.openQuestion" }]
        const isLastQuestion = (input.openQuestionPosition ?? TOTAL_QUESTIONS) >= TOTAL_QUESTIONS
        return [
            ...finalizeIfNeeded(input),
            { kind: "but-pha.closeQuestion" },
            ...(isLastQuestion ? [] : [{ kind: "but-pha.openQuestion" as const }]),
        ]
    },
}
