import type { ConsoleQuestion } from "./live"

export interface Verdict {
    playerId: string
    correct: boolean
}

export interface KeywordVerdict {
    playerId: string
    questionId: string
    correct: boolean
}

export type LiveAction =
    | { kind: "giai-ma.start"; playerIds: string[]; hintIds: string[] }
    | { kind: "giai-ma.openHint"; hintId: string }
    | { kind: "giai-ma.startWindow" }
    | { kind: "giai-ma.closeHintWindow" }
    | { kind: "giai-ma.resolveHint"; verdicts: Verdict[] }
    | { kind: "giai-ma.submitKeyword"; playerId: string; questionId: string; text: string }
    | { kind: "giai-ma.judgeKeyword"; playerId: string; questionId: string; correct: boolean }
    | { kind: "giai-ma.judgeKeywords"; verdicts: KeywordVerdict[] }
    | { kind: "giai-ma.endRound" }
    | { kind: "giai-ma.lockHints" }
    | { kind: "giai-ma.startKeywordWindow" }
    | { kind: "but-pha.start" }
    | { kind: "but-pha.openQuestion" }
    | { kind: "but-pha.closeQuestion" }
    | { kind: "but-pha.startClock" }
    | { kind: "but-pha.endRound" }
    | { kind: "but-pha.finalize"; questionId: string; verdicts: Verdict[] }
    | { kind: "khoi-dong.start"; phase?: 1 | 2 }
    | { kind: "khoi-dong.recordOral"; correct: boolean; spentS: number; playerId?: string }
    | { kind: "khoi-dong.setTurn"; playerId: string }
    | { kind: "khoi-dong.startClock" }
    | { kind: "khoi-dong.timeOutRun" }
    | { kind: "khoi-dong.startWindow" }
    | { kind: "khoi-dong.judge"; playerId: string; correct: boolean }
    | { kind: "khoi-dong.nextQuestion" }
    | { kind: "khoi-dong.endRound" }
    | { kind: "ve-dich.start"; phase?: 1 | 2 }
    | { kind: "ve-dich.openQuestion"; questionId: string }
    | { kind: "ve-dich.reveal" }
    | { kind: "ve-dich.startClock" }
    | { kind: "ve-dich.closeCurrentAnswer" }
    | { kind: "ve-dich.lockBuzz" }
    | { kind: "ve-dich.resolve"; answerer: boolean; buzzer?: boolean }
    | { kind: "ve-dich.advanceTurn" }
    | { kind: "ve-dich.setTurn"; playerId: string }
    | { kind: "ve-dich.endRound" }
    | { kind: "ve-dich.declarePower"; playerId: string; power: "STAR" | "ASSIGN" | null; targetId?: string }
    | { kind: "ve-dich.pick"; playerId: string; questionId: string }
    | { kind: "ve-dich.pickBatch"; playerId: string; questionIds: string[] }
    | { kind: "ve-dich.pickRound"; questionIds: string[] }
    | { kind: "ve-dich.confirmPicks" }
    | { kind: "ve-dich.openPending"; questionId: string }
    | { kind: "ve-dich.switchQuestion"; questionId: string }
    | { kind: "ve-dich.closeQuestion" }
    | { kind: "ve-dich.nextQuestion" }
    | { kind: "ve-dich.clearPicks" }
    | { kind: "ve-dich.judge"; playerId: string; correct: boolean }
    | { kind: "round.goTo"; roundId: string }
    | { kind: "round.waiting" }
    | { kind: "score.adjust"; userId: string; delta: number; reason: string }
    | { kind: "answer.regrade"; questionId: string; playerId: string; delta: number }
    | { kind: "reveal.answer"; questionId: string }

/**
 * Field types a tool-call payload may carry, by name. The exhaustive
 * `REQUIRED_FIELDS` table below doubles as the kind registry: a new union
 * variant cannot compile until its payload (or `{}`) is declared here.
 */
type FieldSpec =
    | "string"
    | "boolean"
    | "number"
    | "string[]"
    | "phase"
    | "power"
    | "verdicts"
    | "keywordVerdicts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null

const fieldOk = (spec: FieldSpec, value: unknown): boolean => {
    switch (spec) {
        case "string":
            return typeof value === "string"
        case "boolean":
            return typeof value === "boolean"
        case "number":
            return typeof value === "number"
        case "string[]":
            return Array.isArray(value) && value.every((item) => typeof item === "string")
        case "phase":
            return value === 1 || value === 2
        case "power":
            return value === "STAR" || value === "ASSIGN" || value === null
        case "verdicts":
            return (
                Array.isArray(value) &&
                value.every(
                    (entry) =>
                        isRecord(entry) &&
                        typeof entry.playerId === "string" &&
                        typeof entry.correct === "boolean"
                )
            )
        case "keywordVerdicts":
            return (
                Array.isArray(value) &&
                value.every(
                    (entry) =>
                        isRecord(entry) &&
                        typeof entry.playerId === "string" &&
                        typeof entry.questionId === "string" &&
                        typeof entry.correct === "boolean"
                )
            )
    }
}

const REQUIRED_FIELDS: Record<LiveAction["kind"], Record<string, FieldSpec>> = {
    "giai-ma.start": { playerIds: "string[]", hintIds: "string[]" },
    "giai-ma.openHint": { hintId: "string" },
    "giai-ma.startWindow": {},
    "giai-ma.closeHintWindow": {},
    "giai-ma.resolveHint": { verdicts: "verdicts" },
    "giai-ma.submitKeyword": {
        playerId: "string",
        questionId: "string",
        text: "string",
    },
    "giai-ma.judgeKeyword": { playerId: "string", questionId: "string", correct: "boolean" },
    "giai-ma.judgeKeywords": { verdicts: "keywordVerdicts" },
    "giai-ma.endRound": {},
    "giai-ma.lockHints": {},
    "giai-ma.startKeywordWindow": {},
    "but-pha.start": {},
    "but-pha.openQuestion": {},
    "but-pha.closeQuestion": {},
    "but-pha.startClock": {},
    "but-pha.endRound": {},
    "but-pha.finalize": { questionId: "string", verdicts: "verdicts" },
    "khoi-dong.start": {},
    "khoi-dong.recordOral": { correct: "boolean", spentS: "number" },
    "khoi-dong.setTurn": { playerId: "string" },
    "khoi-dong.startClock": {},
    "khoi-dong.timeOutRun": {},
    "khoi-dong.startWindow": {},
    "khoi-dong.judge": { playerId: "string", correct: "boolean" },
    "khoi-dong.nextQuestion": {},
    "khoi-dong.endRound": {},
    "ve-dich.start": {},
    "ve-dich.openQuestion": { questionId: "string" },
    "ve-dich.reveal": {},
    "ve-dich.startClock": {},
    "ve-dich.closeCurrentAnswer": {},
    "ve-dich.lockBuzz": {},
    "ve-dich.resolve": { answerer: "boolean" },
    "ve-dich.advanceTurn": {},
    "ve-dich.setTurn": { playerId: "string" },
    "ve-dich.endRound": {},
    "ve-dich.declarePower": { playerId: "string", power: "power" },
    "ve-dich.pick": { playerId: "string", questionId: "string" },
    "ve-dich.pickBatch": { playerId: "string", questionIds: "string[]" },
    "ve-dich.pickRound": { questionIds: "string[]" },
    "ve-dich.confirmPicks": {},
    "ve-dich.openPending": { questionId: "string" },
    "ve-dich.switchQuestion": { questionId: "string" },
    "ve-dich.closeQuestion": {},
    "ve-dich.nextQuestion": {},
    "ve-dich.clearPicks": {},
    "ve-dich.judge": { playerId: "string", correct: "boolean" },
    "round.goTo": { roundId: "string" },
    "round.waiting": {},
    "score.adjust": { userId: "string", delta: "number", reason: "string" },
    "answer.regrade": { questionId: "string", playerId: "string", delta: "number" },
    "reveal.answer": { questionId: "string" },
}

const OPTIONAL_FIELDS: Partial<Record<LiveAction["kind"], Record<string, FieldSpec>>> = {
    "khoi-dong.start": { phase: "phase" },
    "khoi-dong.recordOral": { playerId: "string" },
    "ve-dich.start": { phase: "phase" },
    "ve-dich.resolve": { buzzer: "boolean" },
    "ve-dich.declarePower": { targetId: "string" },
}

function isLiveActionKind(kind: string): kind is LiveAction["kind"] {
    return Object.hasOwn(REQUIRED_FIELDS, kind)
}

/**
 * The whole payload, not just the name: a known kind with a misshapen body
 * would otherwise ride the cast straight to the wire.
 */
export function isLiveAction(value: unknown): value is LiveAction {
    if (!isRecord(value)) return false
    if (typeof value.kind !== "string" || !isLiveActionKind(value.kind)) return false
    for (const [field, spec] of Object.entries(REQUIRED_FIELDS[value.kind])) {
        if (!fieldOk(spec, value[field])) return false
    }
    const optional = OPTIONAL_FIELDS[value.kind]
    if (optional) {
        for (const [field, spec] of Object.entries(optional)) {
            if (value[field] === undefined) continue
            if (!fieldOk(spec, value[field])) return false
        }
    }
    return true
}

/** The kind an untrusted payload claims, for error copy only. */
export function actionKindOf(value: unknown): string | null {
    if (!isRecord(value)) return null
    return typeof value.kind === "string" ? value.kind : null
}

export function collapseKeywordVerdicts(actions: LiveAction[]): LiveAction[] {
    if (actions.length === 0) return actions
    const verdicts: KeywordVerdict[] = []
    for (const action of actions) {
        if (action.kind !== "giai-ma.judgeKeyword") return actions
        verdicts.push({
            playerId: action.playerId,
            questionId: action.questionId,
            correct: action.correct,
        })
    }
    return [{ kind: "giai-ma.judgeKeywords", verdicts }]
}

export function startAction(
    roundId: string,
    opts: {
        phase?: 1 | 2;
        playerIds: string[];
        questions: ConsoleQuestion[]
    }
): LiveAction | null {
    const { phase, playerIds, questions } = opts
    switch (roundId) {
        case "giai-ma": {
            const hintIds = questions
                .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
                .sort((a, b) => a.position - b.position)
                .map((q) => q._id)
            return { kind: "giai-ma.start", playerIds, hintIds }
        }
        case "khoi-dong":
            return { kind: "khoi-dong.start", phase: phase === 2 ? 2 : 1 }
        case "ve-dich":
            return { kind: "ve-dich.start", phase: phase === 2 ? 2 : 1 }
        case "but-pha":
            return { kind: "but-pha.start" }
        default:
            return null
    }
}
