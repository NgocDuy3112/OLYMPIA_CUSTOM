import type { ConsoleQuestion, QuestionAnswerRow, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "@/rounds/types"

export type VeDichPickCtx = ScreenCore & {
    questions: ConsoleQuestion[]
    consoleVeDich: VeDichConsole | null
    setSelectedPlayer: (userId: string) => void
}

export type VeDichPlayCtx = ScreenCore & {
    remaining: number | null
    consoleVeDich: VeDichConsole | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
}

export type VeDichRiengCtx = VeDichPlayCtx

export type VeDichChungCtx = VeDichPlayCtx & { rows: QuestionAnswerRow[] }

export type VeDichRiengPickCtx = VeDichPickCtx

export type VeDichChungPickCtx = VeDichPickCtx
