import type { StandingRow } from "@/data/schedule"
import { pointsForPlacement } from "@/lib/rankingPoints"

const standingsSeed: Omit<StandingRow, "points">[] = [
    { id: "p2", rank: 1, name: "Ngọc Đức", best: 1, prevPoints: 20 },
    { id: "p1", rank: 2, name: "Minh Hoàng", best: 2, prevPoints: 30 },
    { id: "p7", rank: 3, name: "D. Chen", best: 3, prevPoints: 12 },
    { id: "p4", rank: 4, name: "L. Ruiz", best: 4, prevPoints: 8 },
    { id: "p5", rank: 5, name: "P. Okafor", best: 5, prevPoints: 5 },
    { id: "p3", rank: 6, name: "K. Ibrahim", best: 9, prevPoints: 3 },
]
export const sampleStandings: StandingRow[] = standingsSeed.map((row) => ({
    ...row,
    points: pointsForPlacement(row.best),
}))