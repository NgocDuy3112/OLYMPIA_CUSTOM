import type { ConsoleQuestion } from "./live"

export interface Verdict {
    playerId: string
    correct: boolean
}

export type LiveAction =
    | { kind: "giai-ma.start"; playerIds: string[]; hintIds: string[] }
    | { kind: "giai-ma.openHint"; hintId: string }
    | { kind: "giai-ma.startWindow" }
    | { kind: "giai-ma.closeHintWindow" }
    | { kind: "giai-ma.resolveHint"; verdicts: Verdict[] }
    | { kind: "giai-ma.submitKeyword"; playerId: string; questionId: string; text: string; suggestion: "CORRECT" | "INCORRECT" }
    | { kind: "giai-ma.judgeKeyword"; playerId: string; questionId: string; correct: boolean }
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
