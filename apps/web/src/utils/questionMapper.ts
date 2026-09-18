import type { Question } from "@/types/question";

export interface QuestionApiPayload {
  question_code?: unknown;
  questionCode?: unknown;
  content?: unknown;
  answer?: unknown;
  explanation?: unknown;
  media_url?: unknown;
  mediaUrl?: unknown;
  options?: unknown;
  is_used?: unknown;
  isUsed?: unknown;
}

export interface QuestionWebSocketPayload {
  question_code?: unknown;
  content?: unknown;
  answer?: unknown;
  explanation?: unknown;
  media_source?: unknown;
}

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);
const mediaValue = (value: unknown): string | undefined => {
  const result = stringValue(value).trim();
  return result || undefined;
};
const boolValue = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

export interface NormalizedQuestionRow {
  questionCode: string;
  content: string;
  answer: string;
  explanation: string | null;
  mediaUrl: string | null;
  options: string | null;
  isUsed: boolean;
}

// Backend drizzle returns camelCase (questionCode, mediaUrl, isUsed).
// Normalize to one shape so bank/match tables read the same.
export function normalizeQuestionRow(
  row: Record<string, unknown>,
): NormalizedQuestionRow {
  return {
    questionCode: stringValue(row.question_code ?? row.questionCode),
    content: stringValue(row.content),
    answer: stringValue(row.answer),
    explanation:
      row.explanation == null ? null : stringValue(row.explanation),
    mediaUrl:
      (row.media_url ?? row.mediaUrl) == null
        ? null
        : stringValue(row.media_url ?? row.mediaUrl),
    options:
      row.options == null
        ? null
        : Array.isArray(row.options)
          ? (row.options as unknown[]).map(String).join("|")
          : stringValue(row.options),
    isUsed: boolValue(row.is_used ?? row.isUsed),
  };
}

export function mapQuestionApiPayload(
  payload: QuestionApiPayload | null | undefined,
  fallbackCode = "",
): Question {
  return {
    questionCode:
      stringValue(
        (payload as Record<string, unknown> | null | undefined)?.[
          "question_code"
        ] ?? payload?.questionCode,
      ) || fallbackCode,
    questionText: stringValue(payload?.content),
    questionAnswer: stringValue(payload?.answer),
    questionExplanation: stringValue(payload?.explanation),
    questionMediaURL: mediaValue(payload?.media_url ?? payload?.mediaUrl),
    questionOptions: Array.isArray(payload?.options)
      ? payload.options.map(String).join("|")
      : typeof payload?.options === "string"
        ? payload.options
        : undefined,
  };
}

export function mapQuestionWebSocketPayload(
  payload: QuestionWebSocketPayload | null | undefined,
  fallbackCode = "",
): Question {
  return {
    questionCode: stringValue(payload?.question_code) || fallbackCode,
    questionText: stringValue(payload?.content),
    questionAnswer: stringValue(payload?.answer),
    questionExplanation: stringValue(payload?.explanation),
    questionMediaURL: mediaValue(payload?.media_source),
  };
}
