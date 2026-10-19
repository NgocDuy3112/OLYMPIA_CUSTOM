// khoi-dong: every correct answer is worth a flat 10 points. Wrong = 0.
export const KHOI_DONG_POINTS = 10;

export function khoiDongPoints(correct: boolean): number {
    return correct ? KHOI_DONG_POINTS : 0;
}
