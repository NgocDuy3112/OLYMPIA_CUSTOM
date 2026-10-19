// ve-dich: percentages of the question's face value (20/30/40/50).
export type Power = "HOPE" | "SHIELD";

const CORRECT_PCT = 1.0;
const WRONG_PCT = -0.5;

const POWER_PCT: Record<Power, { correct: number; wrong: number }> = {
    HOPE: { correct: 1.5, wrong: -1.0 },   // +150% / -100%
    SHIELD: { correct: 0.5, wrong: 0 }     // +50%  / 0
};

export function veDichPoints(params: {
    faceValue: number;
    correct: boolean;
    power?: Power;
}): number {
    const { faceValue, correct, power } = params;

    const pct = power
        ? (correct ? POWER_PCT[power].correct : POWER_PCT[power].wrong)
        : (correct ? CORRECT_PCT : WRONG_PCT);

    return Math.round(faceValue * pct);
}
