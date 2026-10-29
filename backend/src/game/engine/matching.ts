// Auto-match: decide whether a player's typed answer is correct, using the answer and
// normalize rules stored on the question copy. Pure and deterministic; no I/O.
import type {
    AnswerValue,
    Normalize,
    QuestionPayload
} from "../contracts/index.js";

export type QuestionKind = "MC" | "TEXT" | "KEYWORD" | "HINT";

// Vietnamese-aware normalization. Order matters: trim, then case, then đ/Đ -> d,
// then strip combining diacritics. NFD does not decompose đ, so it needs its own step.
export function normalizeText(input: string, rules: Normalize): string {
    let s = input;
    if (rules.trim) s = s.trim();
    if (!rules.caseSensitive) s = s.toLowerCase();
    if (rules.stripAccents) {
        s = s.replace(/đ/g, "d");
        s = s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    }
    return s;
}

function uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort();
}

function sameSet(a: string[], b: string[]): boolean {
    const left = uniqueSorted(a);
    const right = uniqueSorted(b);
    return left.length === right.length && left.every((v, i) => v === right[i]);
}

interface McPayload { options: Array<{ id: string; text: string }>; correctSet: string[] }
interface TextPayload { acceptedAnswers: string[]; normalize: Normalize }
interface KeywordPayload { code: string; normalize: Normalize }

// Returns true when the submitted value matches the question's stored answer.
// Enumeration order is tried by callers with the question's kind, which the payload
// shape mirrors (validated at write time by assertPayloadForKind).
export function autoMatch(
    kind: QuestionKind,
    payload: QuestionPayload,
    value: AnswerValue
): boolean {
    if (kind === "MC") {
        if (!("picked" in value)) return false;
        const { correctSet } = payload as McPayload;
        return value.picked.length > 0 && sameSet(value.picked, correctSet);
    }

    if (!("text" in value)) return false;
    const submitted = value.text;
    if (submitted.length === 0) return false;

    // A hint answers exactly like TEXT — same payload, same rules.
    if (kind === "TEXT" || kind === "HINT") {
        const { acceptedAnswers, normalize } = payload as TextPayload;
        const needle = normalizeText(submitted, normalize);
        return acceptedAnswers.some((answer) => normalizeText(answer, normalize) === needle);
    }

    const { code, normalize } = payload as KeywordPayload;
    return normalizeText(submitted, normalize) === normalizeText(code, normalize);
}
