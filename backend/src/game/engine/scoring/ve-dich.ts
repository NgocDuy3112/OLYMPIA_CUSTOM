// ve-dich: percentages of the question's face value (20/30/40/50).
//
// Two powers, and they are NOT the same kind of thing:
//
//   STAR   — a multiplier on your OWN answer. Fixes the outcome of the question
//            you are answering; usable anywhere in the round (Chung and Riêng).
//            Configurable per tournament (`powers.star`, default +150% / −100%).
//
//   ASSIGN — a target. You hand the question to another player, and the two of
//            you RACE to buzz for it: the faster one answers, alone. The numbers
//            below are the show's rule, not a knob — they express a duel, not a
//            multiplier, so there is nothing for a tournament to configure.
//            Riêng (phase 2) only.
export type Power = "STAR" | "ASSIGN";

export interface VeDichScoring {
    correctPct: number;
    incorrectPct: number;
    star: { correct: number; incorrect: number };
}

/** The ASSIGN duel's fixed outcome table (signed percentages of face value). */
export const ASSIGN_RULES = {
    /** The faster buzzer answers: right → +100%. */
    buzzerCorrectPct: 1,
    /** …wrong → −50%. */
    buzzerIncorrectPct: -0.5,
    /** The other half of the pair loses 50% when the buzzer was right… */
    partnerWhenBuzzerCorrectPct: -0.5,
    /** …and nothing when the buzzer was wrong. */
    partnerWhenBuzzerIncorrectPct: 0,
    /** Nobody buzzes: BOTH lose 50%. */
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

/**
 * What an ASSIGN question pays the two players it involves. `buzzerCorrect` is
 * null when nobody buzzed in the window — then both halves lose 50%.
 */
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
