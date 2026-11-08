export interface SpeedBands {
    bands: Array<{ untilSec: number; points: number }>;
    multipliers: number[];
    lateMultiplier: number;
}

export function basePointsForTime(seconds: number, bands: SpeedBands["bands"]): number {
    for (const band of bands) {
        if (seconds < band.untilSec) return band.points;
    }
    return bands[bands.length - 1]?.points ?? 0;
}

export function speedMultiplier(order: number, rules: SpeedBands): number {
    if (order < 1) throw new RangeError(`order must be >= 1, got ${order}`);
    return rules.multipliers[order - 1] ?? rules.lateMultiplier;
}

export function butPhaPoints(params: {
    correct: boolean;
    seconds: number;
    order: number;
}, rules: SpeedBands): number {
    if (!params.correct) return 0;
    return basePointsForTime(params.seconds, rules.bands) * speedMultiplier(params.order, rules);
}
