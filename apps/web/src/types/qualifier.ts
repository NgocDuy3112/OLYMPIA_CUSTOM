export type QualifierOption = "A" | "B" | "C" | "D" | "E" | "F";

export const QUALIFIER_OPTIONS: QualifierOption[] = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
];

export const QUALIFIER_ROUND_COUNT = 4;

export const QUALIFIER_QUESTIONS_PER_ROUND: Record<number, number> = {
  1: 8,
  2: 4,
  3: 2,
  4: 2,
  5: 8,
};

export const QUALIFIER_TIME_LIMIT = 10;

export const QUALIFIER_QUESTION_PREFIX = "OC3_Q_VL";

export interface QualifierStandingEntry {
  user_code: string;
  user_name: string;
  total_score: number;
  correct_score: number;
  avg_response_time: number;
  rank: number;
}

export interface QualifierScoreUpdate {
  user_code: string;
  delta: number;
  new_total: number;
  is_correct: boolean;
}

export interface QualifierScoresUpdatedMessage {
  type: "qualifier_scores_updated";
  question_code: string;
  correct_answer: string;
  correct_count: number;
  wrong_count: number;
  score_updates: QualifierScoreUpdate[];
}
