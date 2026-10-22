import type { PlacementTier } from "../../contracts/index.js";

// The tournament's points: what a place of the season is worth.
//
// This is **per tournament** — a tournament that does not award points for places has
// no scale at all, and a tournament with a different field or finale size needs its own
// bands. The scales below are presets, not defaults: the Olympia one belongs to the
// Olympia tournament, and a season inherits its tournament's scale unless it brings
// its own.
export interface PlacementScale {
    title: string;
    description: string;
    tiers: PlacementTier[];
}

// The Olympia scale: a field of sixteen, a finale of four.
export const OLYMPIA_SCALE: PlacementScale = {
    title: "Olympia",
    description: "16 places, a finale of 4",
    tiers: [
        { min: 1, max: 1, points: 25 },
        { min: 2, max: 2, points: 18 },
        { min: 3, max: 3, points: 12 },
        { min: 4, max: 4, points: 8 },
        { min: 5, max: 7, points: 5 },
        { min: 8, max: 10, points: 3 },
        { min: 11, max: 13, points: 2 },
        { min: 14, max: 16, points: 1 }
    ]
};

// The scales a tournament can be set up with.
export const PLACEMENT_SCALES: PlacementScale[] = [OLYMPIA_SCALE];

// The points a place is worth. A place outside the tiers is worth nothing, and so is
// every place of a tournament with no scale.
export function pointsForPlace(tiers: PlacementTier[] | null | undefined, place: number): number {
    if (!tiers || tiers.length === 0) return 0;
    const tier = tiers.find((entry) => place >= entry.min && place <= entry.max);
    return tier?.points ?? 0;
}
