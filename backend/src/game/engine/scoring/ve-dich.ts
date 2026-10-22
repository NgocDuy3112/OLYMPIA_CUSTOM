// ve-dich: percentages of the question's face value (20/30/40/50).
export type Power = "HOPE" | "SHIELD";

export interface VeDichScoring {
    correctPct: number;
    incorrectPct: number;
    hope: { correct: number; incorrect: number };
    shield: { correct: number; incorrect: number };
}

export function veDichPoints(params: {
    faceValue: number;
    correct: boolean;
    power?: Power;
}, scoring: VeDichScoring): number {
    const { faceValue, correct, power } = params;

    const pct = power
        ? (correct ? scoring[power.toLowerCase() as "hope" | "shield"].correct
                   : scoring[power.toLowerCase() as "hope" | "shield"].incorrect)
        : (correct ? scoring.correctPct : scoring.incorrectPct);

    return Math.round(faceValue * pct);
}
