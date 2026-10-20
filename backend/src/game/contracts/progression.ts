import { Type, Static } from "@sinclair/typebox";

// How a tournament advances, as opposed to how a round is played (that is `format`).
// The default lives on the tournament and is copied to the season at creation.
export const ProgressionSchema = Type.Object({
    // qualification: one mass event; the top `advance` players proceed
    advance: Type.Integer({ minimum: 4 }),
    questionCount: Type.Integer({ minimum: 1 }),

    // splitting: matches of `groupSize`, drawn one player from each rank tier
    groupSize: Type.Integer({ minimum: 2 }),
    splittingRounds: Type.Integer({ minimum: 1 }),

    // the ladder ends with one match of `finaleSize` players
    finaleSize: Type.Integer({ minimum: 2 })
});
export type Progression = Static<typeof ProgressionSchema>;

export class ProgressionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProgressionError";
    }
}

// This draw scheme is only self-consistent for a square: with `n` tiers of `groupSize`
// and one player from each tier per match, a match has `advance / groupSize` seats, which
// must equal `groupSize`. 16 advancing into matches of 4 is the canonical case.
export function assertValidProgression(progression: Progression): void {
    const { advance, groupSize, finaleSize, questionCount } = progression;

    if (questionCount < 1) {
        throw new ProgressionError("qualification needs at least one question");
    }

    if (advance !== groupSize ** 2) {
        throw new ProgressionError(
            `advance must equal groupSize squared (got advance=${advance}, groupSize=${groupSize})`
        );
    }
    if (finaleSize !== groupSize) {
        throw new ProgressionError(
            `the ladder produces groupSize finalists (got finaleSize=${finaleSize}, groupSize=${groupSize})`
        );
    }
}
