import type { Question } from "@/types/question";

export interface QuestionApiPayload {
    question_code?: unknown;
    content?: unknown;
    answer?: unknown;
    explanation?: unknown;
    media_url?: unknown;
    options?: unknown;
}

export interface QuestionWebSocketPayload {
    question_code?: unknown;
    content?: unknown;
    answer?: unknown;
    explanation?: unknown;
    media_source?: unknown;
}

const stringValue = (value: unknown): string => typeof value === "string" ? value : value == null ? "" : String(value);
const mediaValue = (value: unknown): string | undefined => {
    const result = stringValue(value).trim();
    return result || undefined;
};

export function mapQuestionApiPayload(payload: QuestionApiPayload | null | undefined, fallbackCode = ""): Question {
    return {
        questionCode: stringValue(payload?.question_code) || fallbackCode,
        questionText: stringValue(payload?.content),
        questionAnswer: stringValue(payload?.answer),
        questionExplanation: stringValue(payload?.explanation),
        questionMediaURL: mediaValue(payload?.media_url),
        questionOptions: Array.isArray(payload?.options) ? payload.options.map(String).join("|") : typeof payload?.options === "string" ? payload.options : undefined,
    };
}

export function mapQuestionWebSocketPayload(payload: QuestionWebSocketPayload | null | undefined, fallbackCode = ""): Question {
    return {
        questionCode: stringValue(payload?.question_code) || fallbackCode,
        questionText: stringValue(payload?.content),
        questionAnswer: stringValue(payload?.answer),
        questionExplanation: stringValue(payload?.explanation),
        questionMediaURL: mediaValue(payload?.media_source),
    };
}
