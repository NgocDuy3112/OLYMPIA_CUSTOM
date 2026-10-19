import type { MatchEventPayload } from "../../game/contracts/index.js";

// Facts are the append-only record of what happened in a live round. They are written
// in the same transaction as the round state, so state and facts can never disagree.

export type Verdict = "CORRECT" | "INCORRECT";

// One row in `answers`: a player's answer to a question (hint or keyword).
export interface AnswerFact {
    type: "answer";
    questionId: string;
    userId: string;
    value: { text: string } | { picked: string[] } | { oral: true };
    verdict: Verdict;
    pointsAwarded: number;
    autoMatched: boolean;
}

// One row in `match_events`: a PICK, BUZZ, or POWER.
export interface EventFact {
    type: "event";
    questionId: string;
    userId: string;
    roundId: string | null;
    kind: "PICK" | "BUZZ" | "POWER";
    payload: MatchEventPayload;
}

export type LiveFact = AnswerFact | EventFact;
