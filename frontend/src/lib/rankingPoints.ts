export const PLACEMENT_TIERS: { min: number; max: number; points: number }[] = [
    { min: 1, max: 1, points: 30 },
    { min: 2, max: 2, points: 20 },
    { min: 3, max: 3, points: 12 },
    { min: 4, max: 4, points: 8 },
    { min: 5, max: 7, points: 5 },
    { min: 8, max: 10, points: 3 },
    { min: 11, max: 13, points: 2 },
    { min: 14, max: 16, points: 1 },
]

export function pointsForPlacement(placement: number): number {
    return (
        PLACEMENT_TIERS.find(
            (t) => placement >= t.min && placement <= t.max
        )?.points ?? 0
    )
}

export function carryOverPoints(prevPoints: number): number {
    return Math.floor(prevPoints / 2)
}