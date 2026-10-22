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

// How well a scale covers the places a season produces. A place with no band scores
// zero, silently — this is what catches that.
export interface ScaleCoverage {
    places: number;              // the places the season produces
    covered: number;             // how many of them have a band
    missing: number[];           // the places that have none
    beyond: number[];            // the places the scale reaches past the season
}

export function scaleCoverage(
    tiers: PlacementTier[] | null | undefined,
    places: number
): ScaleCoverage {
    if (!tiers || tiers.length === 0) {
        return { places, covered: 0, missing: Array.from({ length: places }, (_, i) => i + 1), beyond: [] };
    }

    const missing: number[] = [];
    for (let place = 1; place <= places; place++) {
        if (pointsForPlace(tiers, place) === 0) missing.push(place);
    }

    const beyond: number[] = [];
    for (const tier of tiers) {
        if (tier.min > places) beyond.push(tier.min);
    }

    return { places, covered: places - missing.length, missing, beyond };
}

// The points a place is worth. A place outside the tiers is worth nothing, and so is
// every place of a season with no scale.
export function pointsForPlace(tiers: PlacementTier[] | null | undefined, place: number): number {
    if (!tiers || tiers.length === 0) return 0;
    const tier = tiers.find((entry) => place >= entry.min && place <= entry.max);
    return tier?.points ?? 0;
}
