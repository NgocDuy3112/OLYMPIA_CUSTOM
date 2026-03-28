/** Possible option labels for a qualifier question. */
export type QualifierOption = "A" | "B" | "C" | "D" | "E" | "F";

export const QUALIFIER_OPTIONS: QualifierOption[] = ["A", "B", "C", "D", "E", "F"];

/** Number of qualifier rounds (excluding the backup round). */
export const QUALIFIER_ROUND_COUNT = 4;

/** Number of questions per qualifier round. */
export const QUALIFIER_QUESTIONS_PER_ROUND: Record<number, number> = {
    1: 8,
    2: 4,
    3: 2,
    4: 2,
    5: 8, // backup round – default to 8 questions
};

/** How many seconds a player has to answer per question. */
export const QUALIFIER_TIME_LIMIT = 10;

/** Question code prefix for Qualifier questions. */
export const QUALIFIER_QUESTION_PREFIX = "OC3_Q_VL";

/** A single player's ranking entry in the qualifier standings. */
export interface QualifierStandingEntry {
    user_code: string;
    user_name: string;
    total_score: number;
    correct_score: number;
    avg_response_time: number;
    rank: number;
}

/** Response payload from POST /qualifier/calculate-scores */
export interface QualifierScoreUpdate {
    user_code: string;
    delta: number;
    new_total: number;
    is_correct: boolean;
}

/** WebSocket message: qualifier_scores_updated */
export interface QualifierScoresUpdatedMessage {
    type: "qualifier_scores_updated";
    question_code: string;
    correct_answer: string;
    correct_count: number;
    wrong_count: number;
    score_updates: QualifierScoreUpdate[];
}
