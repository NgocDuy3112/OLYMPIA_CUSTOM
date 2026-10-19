// but-pha: base points by answer time, multiplied by correct-answer order.
export const SPEED_MULTIPLIERS = [4, 3, 2] as const;
export const LATE_MULTIPLIER = 1; 

export function basePointsForTime(seconds: number): number {
    if (seconds < 5) return 15;
    if (seconds < 15) return 10;
    return 5;
}

// `order` is 1-based: 1 = first correct answer on that question.
export function speedMultiplier(order: number): number {
    if (order < 1) throw new RangeError(`order must be >= 1, got ${order}`);
    return SPEED_MULTIPLIERS[order - 1] ?? LATE_MULTIPLIER;
}

// Wrong or no answer = 0. Correct answer = base(time) × multiplier(order).
export function butPhaPoints(params: {
    correct: boolean;
    seconds: number;
    order: number;
}): number {
    if (!params.correct) return 0;
    return basePointsForTime(params.seconds) * speedMultiplier(params.order);
}
