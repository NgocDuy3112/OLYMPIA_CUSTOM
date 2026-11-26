import type { ConsoleQuestion, SanitizedQuestion } from "./questions"
import type { TieBreakView } from "./tiebreak"

export type { SanitizedQuestion as PlayerQuestion } from "./questions"

export type Verdict = "CORRECT" | "INCORRECT"

export type PowerKind = "STAR" | "ASSIGN"

export type AnswerValue = { picked?: string[]; text?: string }

export interface PlayerScoreRow {
    id: string
    displayName: string
    points: number
    rank: number
}

export interface OralRun {
    questionId: string
    question: SanitizedQuestion | null
    playerId: string
    index: number
    total: number
    elapsedS: number
    budgetS: number
    deadlineAt: string | null
}

export interface OpenEntry {
    questionId: string
    deadlineAt: string | null
    frozenRemainingMs?: number | null
    question: SanitizedQuestion | null
}

export interface BoardCell {
    questionId: string
    value: number
    where: "free" | "pending" | "open" | "taken" | "deferred"
}

export interface StagedPower {
    power: PowerKind
    targetId?: string
}

export interface MediaPolicy {
    mode: "all" | "countdown" | "assign"
    turnPlayerId: string | null
    answererId: string | null
    assignedToId: string | null
    buzzerId: string | null
    allowed: string[]
}

export interface PlayerConsole {
    picksConfirmed?: boolean
    pickCount?: number
    turnQuestions?: string[]
    turnValues?: number[]
    powersLeft?: PowerKind[]
}

export interface RevealedContestant {
    userId: string
    name: string
    answer: string | null
    verdict: Verdict | null
    answeredMs?: number | null
}

export interface MySubmission {
    answer: string
    elapsedS: number
}

export interface PlayerMe {
    verdicts?: Record<string, Verdict>
    answerState?: "none" | "answered"
    mySubmission?: MySubmission | null
    myKeywordSubmission?: MySubmission | null
    isMyRun?: boolean
    points?: number
    answered?: string[]
    finalized?: string[]
    windowOpen?: boolean
    questionIndex?: number
    questionCount?: number
    keywordLocked?: boolean
    eliminated?: boolean
    openTile?: number | null
    pickedTiles: number[]
    hintVerdicts: Record<string, string>
    keywordValue?: number | null
    revealedHints?: Array<{ questionId: string; question: SanitizedQuestion | null }>
    hintsRevealed?: number
    score?: number
    powersLeft?: PowerKind[]
    isMyTurn?: boolean
    pendingPicks?: string[]
    isAnswerer?: boolean
    canAnswer?: boolean
    canBuzz?: boolean
    power?: PowerKind | null
    buzzer?: string | null
    buzzerMs?: number | null
}

export interface PlayerView {
    matchId: string
    roundId: string
    version: number
    stage: string
    open: OpenEntry[]
    table: PlayerScoreRow[]
    oral?: OralRun | null
    board?: BoardCell[]
    selectedPlayerId?: string | null
    turnPlayerId?: string | null
    answererId?: string | null
    assignedToId?: string | null
    stagedPower?: StagedPower | null
    console?: PlayerConsole | null
    keyword?: { questionId: string; question: SanitizedQuestion | null } | null
    keywordCode?: string | null
    hintAnswers: Record<string, string>
    keywordDeadlineAt: string | null
    keywordCountdownClosed?: boolean
    keywordLength: number
    keywordKind: string
    me: PlayerMe
    publicVerdicts?: Array<{
        questionId: string
        userId: string
        verdict: Verdict
        answeredMs?: number | null
    }>
    tiebreak?: TieBreakView | null
    audioGate?: { allowed: string[] }
    mediaPolicy?: MediaPolicy
    revealed?: { contestants: RevealedContestant[] }
}

export interface QuestionAnswerRow {
    questionId: string
    userId: string
    value: { picked?: string[]; text?: string; oral?: true } | null
    verdict: Verdict | null
    pointsAwarded: number | null
    answeredMs?: number | null
}

export interface Projection
    extends Omit<
        PlayerView,
        "me" | "keywordDeadlineAt" | "keywordLength" | "keywordKind" | "keywordCode"
    > {
    answers?: QuestionAnswerRow[]
    keywordDeadlineAt?: string | null
    keywordLength?: number
    keywordKind?: string
    keywordCode?: string | null
}

export interface GiaiMaConsole {
    hintsRemaining: string[]
    hintsPicked: string[]
    openHintId: string | null
    windowOpen: boolean
    keywordWindowOpen?: boolean
    hintsLocked?: boolean
    players: Array<{ id: string; keywordLocked: boolean; eliminated: boolean }>
}

export interface VeDichConsole {
    phase: 1 | 2
    turnPlayerId: string | null
    openStage: "current" | "buzz" | null
    revealed?: boolean
    clockStarted?: boolean
    answererId: string | null
    buzzerId: string | null
    buzzerMs: number | null
    power: PowerKind | null
    assignedToId: string | null
    pendingQuestionId: string | null
    pendingValues?: number[]
    turnQuestions?: string[]
    turnValues?: number[]
    turnPicked?: number
    picksConfirmed?: boolean
    pickCount?: number
    powersLeft?: PowerKind[]
    stagedPower: StagedPower | null
    turnPowerUsed: boolean
}

export interface KhoiDongConsole {
    stage: "phase1" | "phase2"
    ended: boolean
    phase2Begun: boolean
    phase2Closed: boolean
    questionIndex: number
    questionCount: number
    windowOpen: boolean
}

export interface ButPhaConsole {
    questionId: string | null
    opened: boolean
    clockStarted?: boolean
}

export interface MatchController {
    id: string
    name: string
    active: boolean
}

export interface LiveResponse {
    version: number
    roundId: string
    state: Record<string, unknown>
    questions: ConsoleQuestion[]
    projection: Projection
    roundEnded: boolean
    connected: string[]
    console: Record<string, unknown> | null
    controller: MatchController | null
}

export class WireError extends Error {
    constructor(
        message: string,
        public readonly path: string
    ) {
        super(message)
        this.name = "WireError"
    }
}

export type ConsoleState =
    | { roundId: "giai-ma"; console: GiaiMaConsole }
    | { roundId: "ve-dich"; console: VeDichConsole }
    | { roundId: "khoi-dong"; console: KhoiDongConsole }
    | { roundId: "but-pha"; console: ButPhaConsole }

const CONSOLE_KEYS = {
    "giai-ma": ["hintsRemaining", "hintsPicked", "openHintId", "windowOpen", "players"],
    "ve-dich": ["phase", "turnPlayerId", "openStage", "powersLeft", "stagedPower", "turnPowerUsed"],
    "khoi-dong": ["stage", "ended", "phase2Begun", "questionIndex", "questionCount", "windowOpen"],
    "but-pha": ["questionId", "opened"],
} as const

function assertConsole<T>(roundId: string, raw: Record<string, unknown>, keys: readonly string[]): T {
    for (const key of keys) {
        if (!(key in raw)) {
            throw new WireError(`console state for round "${roundId}" has no "${key}"`, `console.${key}`)
        }
    }
    return raw as T
}

export function consoleOf(
    roundId: string,
    raw: Record<string, unknown> | null | undefined
): ConsoleState | null {
    if (raw == null) return null
    switch (roundId) {
        case "giai-ma":
            return { roundId, console: assertConsole("giai-ma", raw, CONSOLE_KEYS["giai-ma"]) }
        case "ve-dich":
            return { roundId, console: assertConsole("ve-dich", raw, CONSOLE_KEYS["ve-dich"]) }
        case "khoi-dong":
            return { roundId, console: assertConsole("khoi-dong", raw, CONSOLE_KEYS["khoi-dong"]) }
        case "but-pha":
            return { roundId, console: assertConsole("but-pha", raw, CONSOLE_KEYS["but-pha"]) }
        default:
            throw new WireError(`no console state for round "${roundId}"`, "roundId")
    }
}
