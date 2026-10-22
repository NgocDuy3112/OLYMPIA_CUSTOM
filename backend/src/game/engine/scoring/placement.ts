import type { PlacementTier } from "../../contracts/index.js";

// The tournament's points: what a place is worth.
//
// This is the Olympia scale for a field of sixteen. It is the default for a tournament,
// and a season inherits it from the tournament unless it is given its own.
export const OLYMPIA_PLACEMENT_TIERS: PlacementTier[] = [
    { min: 1, max: 1, points: 25 },
    { min: 2, max: 2, points: 18 },
    { min: 3, max: 3, points: 12 },
    { min: 4, max: 4, points: 8 },
    { min: 5, max: 7, points: 5 },
    { min: 8, max: 10, points: 3 },
    { min: 11, max: 13, points: 2 },
    { min: 14, max: 16, points: 1 }
];

// The points a place is worth. A place outside the tiers is worth nothing.
export function pointsForPlace(tiers: PlacementTier[], place: number): number {
    const tier = tiers.find((entry) => place >= entry.min && place <= entry.max);
    return tier?.points ?? 0;
}
