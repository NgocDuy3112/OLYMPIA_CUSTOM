import type { MatchEventPayload } from "../../game/contracts/index.js";


export type Verdict = "CORRECT" | "INCORRECT";

export interface AnswerFact {
    type: "answer";
    questionId: string;
    userId: string;
    value: { text: string } | { picked: string[] } | { oral: true };
    verdict: Verdict;
    pointsAwarded: number;
    autoMatched: boolean;
}

export interface DraftFact {
    type: "draft";
    questionId: string;
    userId: string;
    value: { text: string } | { picked: string[] };
    suggestion: Verdict;        
}

export interface EventFact {
    type: "event";
    questionId: string;
    userId: string;
    roundId: string | null;
    kind: "PICK" | "BUZZ" | "POWER";
    payload: MatchEventPayload;
}

export interface JudgeFact {
    type: "judge";
    questionId: string;
    userId: string;
    verdict: Verdict;
    pointsAwarded: number;
}

export interface AdjustFact {
    type: "adjust";
    userId: string;
    delta: number;
    reason: string;
    actorId: string;
}

export type LiveFact = AnswerFact | DraftFact | EventFact | JudgeFact | AdjustFact;
