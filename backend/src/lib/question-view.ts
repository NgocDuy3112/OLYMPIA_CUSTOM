// What a QUESTION looks like on any screen that is not the judge's — anywhere a
// question is shown but its answer must not be.
// One function, one rule: console options yes, correct set never.
//
// Pure — no db, no fastify.
import type { MatchQuestion } from "../game/contracts/index.js";

export interface SanitizedQuestion {
    questionId: string;
    kind: MatchQuestion["kind"];
    position: number;
    questionText: string;
    media: MatchQuestion["media"];
    timeLimit: number | null;
    // console carries its options; KEYWORD carries the PUBLIC code length (delta D3:
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
        payload: question.kind === "CHOICE"
            ? { options: (question.payload as { options: Array<{ id: string; text: string }> }).options }
            : question.kind === "KEYWORD" &&
                typeof (question.payload as { code?: unknown }).code === "string"
              ? { codeLength: ((question.payload as { code: string }).code).length }
              : {}
    };
}

/**
 * The MIRROR of sanitizeQuestion: what the correct answer READS on screen when
 * the console reveals it (Hiện đáp án). That one strips the answer from every
 * screen; this one words it — only ever called for a reveal the console asked
 * for, never as part of an ordinary question payload.
 *
 * CHOICE → the correct options' texts; TEXT/HINT → the accepted answers;
 * KEYWORD → the code itself. Empty/null when the payload carries nothing
 * showable — a reveal of nothing is not a reveal.
 */
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
