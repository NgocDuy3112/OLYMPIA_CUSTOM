// khoi-dong: every correct answer is worth a flat number of points. Wrong = 0.
export function khoiDongPoints(correct: boolean, points: number): number {
    return correct ? points : 0;
}
