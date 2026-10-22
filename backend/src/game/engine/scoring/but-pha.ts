// but-pha: base points by answer time, multiplied by the correct-answer order.
export interface SpeedBands {
    bands: Array<{ untilSec: number; points: number }>;
    multipliers: number[];
    lateMultiplier: number;
}

// The base points for an answer given in `seconds`: the last band whose window has not
// passed.
export function basePointsForTime(seconds: number, bands: SpeedBands["bands"]): number {
    for (const band of bands) {
        if (seconds < band.untilSec) return band.points;
    }
    return bands[bands.length - 1]?.points ?? 0;
}

// `order` is 1-based: 1 = first correct answer on that question.
export function speedMultiplier(order: number, rules: SpeedBands): number {
    if (order < 1) throw new RangeError(`order must be >= 1, got ${order}`);
    return rules.multipliers[order - 1] ?? rules.lateMultiplier;
}

// Wrong or no answer = 0. Correct answer = base(time) × multiplier(order).
export function butPhaPoints(params: {
    correct: boolean;
    seconds: number;
    order: number;
}, rules: SpeedBands): number {
    if (!params.correct) return 0;
    return basePointsForTime(params.seconds, rules.bands) * speedMultiplier(params.order, rules);
}
