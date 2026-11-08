export type Power = "STAR" | "ASSIGN";

export interface VeDichScoring {
    correctPct: number;
    incorrectPct: number;
    star: { correct: number; incorrect: number };
}

export const ASSIGN_RULES = {
    buzzerCorrectPct: 1,
    buzzerIncorrectPct: -0.5,
    partnerWhenBuzzerCorrectPct: -0.5,
    partnerWhenBuzzerIncorrectPct: 0,
    nobodyBuzzedPct: -0.5
} as const;

export function veDichPoints(params: {
    faceValue: number;
    correct: boolean;
    power?: Extract<Power, "STAR">;
}, scoring: VeDichScoring): number {
    const { faceValue, correct, power } = params;

    const pct = power === "STAR"
        ? (correct ? scoring.star.correct : scoring.star.incorrect)
        : (correct ? scoring.correctPct : scoring.incorrectPct);

    return Math.round(faceValue * pct);
}

export function assignPayout(params: {
    faceValue: number;
    buzzerCorrect: boolean | null;
}): { buzzer: number; partner: number } {
    const { faceValue, buzzerCorrect } = params;
    if (buzzerCorrect === null) {
        const both = Math.round(faceValue * ASSIGN_RULES.nobodyBuzzedPct);
        return { buzzer: both, partner: both };
    }
    return {
        buzzer: Math.round(faceValue * (buzzerCorrect
            ? ASSIGN_RULES.buzzerCorrectPct
            : ASSIGN_RULES.buzzerIncorrectPct)),
        partner: Math.round(faceValue * (buzzerCorrect
            ? ASSIGN_RULES.partnerWhenBuzzerCorrectPct
            : ASSIGN_RULES.partnerWhenBuzzerIncorrectPct))
    };
}
