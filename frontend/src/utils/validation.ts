const MATCH_PATTERN = /^OC3_M/;
const QUESTION_PATTERN = /^OC3_Q/;
const USER_PATTERN = /^OC_U/;
const ROLES = ["player", "mc", "admin"] as const;
const QUALIFIER_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;

export type Role = typeof ROLES[number];
export type QualifierOption = typeof QUALIFIER_OPTIONS[number];

export const isMatchCode = (value: unknown): value is string => typeof value === "string" && MATCH_PATTERN.test(value);
export const isQuestionCode = (value: unknown): value is string => typeof value === "string" && QUESTION_PATTERN.test(value);
export const isUserCode = (value: unknown): value is string => typeof value === "string" && USER_PATTERN.test(value);
export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);
export const isQualifierOption = (value: unknown): value is QualifierOption => typeof value === "string" && (QUALIFIER_OPTIONS as readonly string[]).includes(value.toUpperCase());
export const isRoundNumber = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
export const isMultipleOfFive = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value % 5 === 0;

export function assertMatchCode(value: unknown): asserts value is string {
    if (!isMatchCode(value)) throw new Error("match_code must start with 'OC3_M'");
}

export function assertQuestionCode(value: unknown): asserts value is string {
    if (!isQuestionCode(value)) throw new Error("question_code must start with 'OC3_Q'");
}

export function assertUserCode(value: unknown): asserts value is string {
    if (!isUserCode(value)) throw new Error("user_code must start with 'OC_U'");
}

export function validateAnswerInput(input: { match_code: unknown; user_code: unknown; question_code: unknown; answer_text?: unknown; has_buzzed: unknown }): void {
    assertMatchCode(input.match_code);
    assertUserCode(input.user_code);
    assertQuestionCode(input.question_code);
    if (!input.answer_text && input.has_buzzed !== true) throw new Error("Must provide either answer_text or has_buzzed=true");
}

export function validateScoreEvent(input: { match_code: unknown; question_code: unknown; user_codes: unknown[] }): void {
    assertMatchCode(input.match_code);
    assertQuestionCode(input.question_code);
    if (!Array.isArray(input.user_codes) || input.user_codes.some((code) => !isUserCode(code))) {
        throw new Error("user_codes must contain only player codes");
    }
}

export function validateScoreAdjust(input: { match_code: unknown; user_code: unknown; new_score?: number | null; question_code?: unknown; points?: number | null }): void {
    assertMatchCode(input.match_code);
    assertUserCode(input.user_code);
    if (input.question_code !== undefined && input.question_code !== null) assertQuestionCode(input.question_code);
    if (input.new_score === null || input.new_score === undefined) {
        if (input.question_code === undefined || input.question_code === null || input.points === null || input.points === undefined) {
            throw new Error("Provide new_score or question_code with points");
        }
    }
    if (input.new_score !== undefined && input.new_score !== null && !isMultipleOfFive(input.new_score)) throw new Error("new_score must be a multiple of 5");
    if (input.points !== undefined && input.points !== null && !isMultipleOfFive(input.points)) throw new Error("points must be a multiple of 5");
}

export function validateRecordInput(input: { match_code: unknown; user_code: unknown; question_code: unknown; points: unknown }): void {
    assertMatchCode(input.match_code);
    assertUserCode(input.user_code);
    assertQuestionCode(input.question_code);
    if (!isMultipleOfFive(input.points)) throw new Error("points must be a multiple of 5");
}

export function validateQualifierScore(input: { match_code: unknown; question_code: unknown; correct_answer: unknown; round_number: unknown }): void {
    assertMatchCode(input.match_code);
    assertQuestionCode(input.question_code);
    if (!isQualifierOption(input.correct_answer)) throw new Error("correct_answer must be one of A, B, C, D, E, F");
    if (!isRoundNumber(input.round_number)) throw new Error("round_number must be between 1 and 5");
}

export function validateEndRound(input: { match_code: unknown; round_number: unknown; advance_count?: unknown }): void {
    assertMatchCode(input.match_code);
    if (!isRoundNumber(input.round_number)) throw new Error("round_number must be between 1 and 5");
    if (input.advance_count !== undefined && input.advance_count !== null && (typeof input.advance_count !== "number" || !Number.isInteger(input.advance_count) || input.advance_count < 0)) {
        throw new Error("advance_count must be non-negative");
    }
}

export function validateQuestionInput(input: { match_code: unknown; question_code: unknown; media_url?: unknown }): void {
    assertMatchCode(input.match_code);
    assertQuestionCode(input.question_code);
    validateMediaUrl(input.media_url);
}

export function validateMediaUrl(value: unknown): void {
    if (value === null || value === undefined || value === "") return;
    const first = String(value).split(",")[0].trim();
    if (!/^https?:\/\//.test(first) && !(isMatchCode(first.split("/")[0]) && first.includes("/"))) {
        throw new Error("media_url must be an http(s) URL or an S3 key");
    }
}
