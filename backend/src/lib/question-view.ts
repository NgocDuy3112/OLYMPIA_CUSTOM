import type { MatchQuestion } from "../game/contracts/index.js";

export interface SanitizedQuestion {
    questionId: string;
    kind: MatchQuestion["kind"];
    position: number;
    questionText: string;
    media: MatchQuestion["media"];
    timeLimit: number | null;
    payload: {
        options?: Array<{ id: string; text: string }>;
        codeLength?: number;
    };
}

export function sanitizeQuestion(question: MatchQuestion): SanitizedQuestion {
    const payload = question.payload as {
        options?: Array<{ id: string; text: string }>;
        code?: string;
    };
    const face =
        Array.isArray(payload.options) && payload.options.length > 0
            ? { options: payload.options }
            : {};
    return {
        questionId: question._id,
        kind: question.kind,
        position: question.position,
        questionText: question.questionText,
        media: question.media,
        timeLimit: question.timeLimit,
        payload:
            question.kind === "KEYWORD" && typeof payload.code === "string"
                ? { codeLength: payload.code.length }
                : face
    };
}

export function answerDisplayOf(question: MatchQuestion): string | null {
    const payload = question.payload as Record<string, unknown>;
    if (question.kind === "CHOICE") {
        const options = (payload.options ?? []) as Array<{ id: string; text: string }>;
        const correct = new Set((payload.correctSet ?? []) as string[]);
        const texts = options.filter((option) => correct.has(option.id)).map((option) => option.text);
        return texts.length > 0 ? texts.join(", ") : null;
    }
    if (question.kind === "TEXT" || question.kind === "HINT") {
        const accepted = (payload.acceptedAnswers ?? []) as string[];
        return accepted.length > 0 ? accepted.join(" / ") : null;
    }
    return typeof payload.code === "string" && payload.code.length > 0 ? payload.code : null;
}
