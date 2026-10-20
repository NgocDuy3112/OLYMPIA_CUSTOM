import { drawGroups, type Rng } from "./plan.js";
import { rngFromSeed } from "./rng.js";

export const SPLITTING_PHASE = "splitting";


export const stageIdFor = (round: number) => `${SPLITTING_PHASE}-${round}`;

export interface Draw {
    stageId: string;
    seed: string;
    groups: string[][];
}

export function drawGroupsFor(params: {
    ranked: string[];
    groupSize: number;
    round: number;
    seed: string;
}): Draw {
    const { ranked, groupSize, round, seed } = params;
    const rng: Rng = rngFromSeed(seed);
    return {
        stageId: stageIdFor(round),
        seed,
        groups: drawGroups(ranked, groupSize, rng)
    };
}

export function replayDraw(params: {
    ranked: string[];
    groupSize: number;
    seed: string;
}): string[][] {
    return drawGroups(params.ranked, params.groupSize, rngFromSeed(params.seed));
}