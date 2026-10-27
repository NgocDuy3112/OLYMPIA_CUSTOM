// What a QUESTION looks like on any screen that is not the judge's — the player's
// live view, the mass event, anywhere a question is shown but its answer must not be.
// One function, one rule: MC options yes, correct set never.
//
// Pure — no db, no fastify. Shared by the qualification (mass event) and live
// surfaces so both deliver the exact same exposure.
import type { MatchQuestion } from "../game/contracts/index.js";

export interface SanitizedQuestion {
    questionId: string;
    kind: MatchQuestion["kind"];
    position: number;
    questionText: string;
    media: MatchQuestion["media"];
    timeLimit: number | null;
    tag: string;
    // MC carries its options; KEYWORD carries the PUBLIC code length (delta D3:
    // "MẬT MÃ GỒM CÓ 25 CHỮ CÁI" is shown on every screen — the letters never
    // are); every other kind arrives as {}. The correct set is never part of this shape.
    payload: {
        options?: Array<{ id: string; text: string }>;
        codeLength?: number;
    };
}

export function sanitizeQuestion(question: MatchQuestion): SanitizedQuestion {
    return {
        questionId: question._id,
        kind: question.kind,
        position: question.position,
        questionText: question.questionText,
        media: question.media,
        timeLimit: question.timeLimit,
        tag: question.tag,
        payload: question.kind === "MC"
            ? { options: (question.payload as { options: Array<{ id: string; text: string }> }).options }
            : question.kind === "KEYWORD" &&
                typeof (question.payload as { code?: unknown }).code === "string"
              ? { codeLength: ((question.payload as { code: string }).code).length }
              : {}
    };
}
