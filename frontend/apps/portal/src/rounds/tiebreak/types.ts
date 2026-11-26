import type {
    AnswerEligibility,
    AnswerMode,
    AnswerWindow,
    TieBreakPlayer,
    TieBreakView,
} from "@shared/wire/tiebreak"

export type { AnswerEligibility, AnswerMode, AnswerWindow, TieBreakPlayer, TieBreakView }

export type TieBreakPostAction =
    | "start"
    | "open-buzz"
    | "lock-buzz"
    | "judge"
    | "advance"
    | "end"

export interface TieBreakPostBody {
    action: TieBreakPostAction
    playerIds?: string[]
    correct?: boolean
    expectedVersion: number
}
