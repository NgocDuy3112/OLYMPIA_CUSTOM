import { mergedVerdicts, type QuestionAnswerRow } from "@/lib/live"

// ── the MC console's pure decisions ──────────────────────────────────────────
// Extracted from live-console so every rule is table-testable
// (tests/lib/deck-logic.test.ts): data in, rail/actions out — no closures, no
// React, no transport. live-console stays the orchestrator: it gathers the data
// and EXECUTES the plan these functions return.

/**
 * Which rail the deck draws: compact identity cards on the personal rounds
 * (khoi-dong's oral run, ve-dich phase 2), answer rows everywhere else.
 */
export function railVariantOf(input: {
    roundId: string
    stage: string
    /** ve-dich only: the current phase (null outside the round). */
    veDichPhase: 1 | 2 | null
}): "compact" | "answers" {
    const { roundId, stage, veDichPhase } = input
    if (roundId === "giai-ma" || roundId === "but-pha") return "answers"
    if (roundId === "ve-dich") return veDichPhase === 2 ? "compact" : "answers"
    return stage === "phase2" ? "answers" : "compact" // khoi-dong (+ unknown rounds)
}

export interface KetThucInput {
    roundId: string
    stage: string
    roundEnded: boolean
    /** khoi-dong S1: an oral run is open (otherwise phase 1 is complete). */
    hasOralRun: boolean
    /** the projection's open question ids. */
    openIds: string[]
    /** the ledger of the question on screen (but-pha finalize). */
    rows: QuestionAnswerRow[]
    /** the MC's staged verdicts, keyed `${questionId}:${userId}`. */
    overrides: Record<string, boolean>
}

/**
 * What Kết thúc sends: the round's whole action plan, in order. The orchestrator
 * runs it (one send, or sendChain when there are several) — the rules for WHAT
 * happens live here, where tests can see them.
 */
export function ketThucPlan(input: KetThucInput): Array<Record<string, unknown>> {
    if (input.roundEnded) return [{ kind: "round.advance" }]

    switch (input.roundId) {
        case "khoi-dong": {
            if (input.stage === "phase1") {
                return [{ kind: input.hasOralRun ? "khoi-dong.timeOutRun" : "khoi-dong.beginPhase2" }]
            }
            // phase 2: commit the staged verdicts first, then close the window.
            const chain: Array<Record<string, unknown>> = []
            for (const { questionId, verdicts } of groupedOverrides(input.overrides)) {
                if (input.openIds.includes(questionId)) {
                    chain.push({ kind: "khoi-dong.finalize", questionId, verdicts })
                }
            }
            chain.push({ kind: "khoi-dong.endRound" })
            return chain
        }
        case "giai-ma":
            return [{ kind: input.openIds.length > 0 ? "giai-ma.closeHintWindow" : "giai-ma.endRound" }]
        case "but-pha": {
            if (input.openIds.length === 0) return [{ kind: "but-pha.endRound" }]
            const questionId = input.openIds[0]
            const chain: Array<Record<string, unknown>> = []
            // finalize once (the engine refuses a second time), then close —
            // the server checks UNJUDGED itself.
            if (input.rows.length > 0 && input.rows.some((row) => !row.judged)) {
                chain.push({ kind: "but-pha.finalize", questionId, verdicts: mergedVerdicts(questionId, input.rows, input.overrides) })
            }
            chain.push({ kind: "but-pha.closeQuestion" })
            return chain
        }
        default:
            // ve-dich: the TURN is hetLuotAction's job — the round just ends
            // (the engine closes any open question with it).
            return [{ kind: "ve-dich.endRound" }]
    }
}

export interface HetLuotInput {
    answererVerdict: "CORRECT" | "INCORRECT" | null
    buzzerId: string | null
    buzzerVerdict: "CORRECT" | "INCORRECT" | null
}

/**
 * ve-dich: the action that finishes the current TURN — resolve the open
 * question with its verdicts. Null while anything is unjudged (the button the
 * screen disables); the engine refuses a resolve without the buzzer verdict.
 */
export function hetLuotAction(input: HetLuotInput): Record<string, unknown> | null {
    const { answererVerdict, buzzerId, buzzerVerdict } = input
    if (answererVerdict === null) return null
    if (buzzerId !== null && buzzerVerdict === null) return null

    const action: Record<string, unknown> = { kind: "ve-dich.resolve", answerer: answererVerdict === "CORRECT" }
    if (buzzerId !== null) action.buzzer = buzzerVerdict === "CORRECT"
    return action
}

/** Overrides grouped per question — the finalize payloads of a plan. */
function groupedOverrides(overrides: Record<string, boolean>): Array<{
    questionId: string
    verdicts: Array<{ playerId: string; correct: boolean }>
}> {
    const grouped = new Map<string, Array<{ playerId: string; correct: boolean }>>()
    for (const [key, correct] of Object.entries(overrides)) {
        const idx = key.indexOf(":")
        const questionId = key.slice(0, idx)
        const playerId = key.slice(idx + 1)
        if (!grouped.has(questionId)) grouped.set(questionId, [])
        grouped.get(questionId)!.push({ playerId, correct })
    }
    return [...grouped].map(([questionId, verdicts]) => ({ questionId, verdicts }))
}
