import type { ConsoleQuestion } from "@/lib/live"

export interface JudgingIds {
    judgingId: string | null
    resolvingId: string | null
    keywordQuestionId: string | null
}

export interface JudgingInput {
    roundId: string
    questions: ConsoleQuestion[]
    openIds: readonly string[]
    selectedQ: string | null
}

const firstOrNull = (ids: readonly string[]): string | null => (ids.length > 0 ? ids[0] : null)

function keywordQuestionIdOf(input: JudgingInput): string | null {
    if (input.roundId !== "giai-ma") return null
    const keyword = input.questions.find((q) => q.roundId === "giai-ma" && q.kind === "KEYWORD")
    return keyword?._id ?? null
}

export function judgingIdsOf(input: JudgingInput): JudgingIds {
    const keywordQuestionId = keywordQuestionIdOf(input)
    const clicked = input.selectedQ !== null && input.openIds.includes(input.selectedQ) ? input.selectedQ : null

    switch (input.roundId) {
        case "khoi-dong":
        case "but-pha":
            return { judgingId: clicked ?? firstOrNull(input.openIds), resolvingId: null, keywordQuestionId }
        case "giai-ma":
            return { judgingId: firstOrNull(input.openIds) ?? keywordQuestionId, resolvingId: null, keywordQuestionId }
        case "ve-dich":
            return { judgingId: null, resolvingId: firstOrNull(input.openIds), keywordQuestionId }
        default:
            return { judgingId: null, resolvingId: null, keywordQuestionId }
    }
}

export function targetOf(answererIds: readonly string[], selectedPlayer: string | null): string | null {
    if (selectedPlayer !== null && answererIds.includes(selectedPlayer)) return selectedPlayer
    return firstOrNull(answererIds)
}
