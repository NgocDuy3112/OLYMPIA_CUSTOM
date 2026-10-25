import { describe, expect, it } from "vitest"
import { statisticsFor } from "../src/lib/match-stats"
import type { Match, PlayerResult } from "../src/lib/types"

const ROUNDS = [
    { id: "khoi-dong", name: "Khởi động", order: 0, chart: "grid" },
    { id: "giai-ma", name: "Giải mã", order: 1, chart: "grid" },
    { id: "ve-dich", name: "Về đích", order: 2, chart: "grid" },
]

const player = (id: string, name: string, score: number, roundScores?: Record<string, number>): PlayerResult => ({
    id, name, seed: 1, score, roundScores,
})

const match = (players: PlayerResult[], status: Match["status"] = "FINISHED"): Match => ({
    id: "m1", stageId: "s1", slot: 1, status, kind: "STANDARD",
    date: "24/10", startTime: "10:00", round: "Playoff · match 1", players,
})

describe("statisticsFor — the round breakdown", () => {
    const m = match([
        player("a", "Ace", 90, { "Khởi động": 50, "Giải mã": 20, "Về đích": 20 }),
        player("b", "Bee", 70, { "Khởi động": 30, "Giải mã": 40 }),
        player("c", "Cid", 10, { "Khởi động": 10 }),
    ])

    it("keeps the tournament's round order and drops rounds nobody scored", () => {
        const stats = statisticsFor(m, ROUNDS)
        expect(stats.rounds.map((r) => r.round)).toEqual(["Khởi động", "Giải mã", "Về đích"])
    })

    it("marks the round winner and gives absent players a zero", () => {
        const stats = statisticsFor(m, ROUNDS)
        expect(stats.rounds[0].scores.map((s) => s.points)).toEqual([50, 30, 10])
        expect(stats.rounds[0].winnerIds).toEqual(["a"])
        // Bee sat out "Về đích" — a zero, present, not missing.
        expect(stats.rounds[2].scores.find((s) => s.playerId === "b")?.points).toBe(0)
        expect(stats.rounds[2].gap).toBe(20)
    })

    it("a tied round shares the win", () => {
        const tied = match([
            player("a", "Ace", 40, { "Khởi động": 20 }),
            player("b", "Bee", 40, { "Khởi động": 20 }),
        ])
        expect(statisticsFor(tied, ROUNDS).rounds[0].winnerIds).toEqual(["a", "b"])
    })
})

describe("statisticsFor — the headline numbers", () => {
    // Every player in every round — the realistic shape of a finished match
    // (an absent round key reads as 0, exactly like the chart draws it).
    const m = match([
        player("a", "Ace", 120, { "Khởi động": 50, "Giải mã": 40, "Về đích": 30 }),
        player("b", "Bee", 80, { "Khởi động": 30, "Giải mã": 40, "Về đích": 10 }),
        player("c", "Cid", 30, { "Khởi động": 10, "Giải mã": 20, "Về đích": 0 }),
    ])

    it("sums, tops, averages and finds the margin", () => {
        const stats = statisticsFor(m, ROUNDS)
        expect(stats.totalPoints).toBe(230)
        expect(stats.topScore).toBe(120)
        expect(stats.averageScore).toBeCloseTo(230 / 3)
        expect(stats.margin).toBe(40)
    })

    it("counts round wins and reports the closest / biggest rounds", () => {
        const stats = statisticsFor(m, ROUNDS)
        // Khởi động → Ace; Giải mã → Ace+Bee tie; Về đích → Ace.
        expect(stats.roundWins).toEqual({ names: ["Ace"], count: 3 })
        // gaps: 40 / 20 / 30 — Giải mã split them the least, Khởi động the most.
        expect(stats.closestRound?.round).toBe("Giải mã")
        expect(stats.biggestRound?.round).toBe("Khởi động")
    })
})

describe("statisticsFor — degrading kindly", () => {
    it("an upcoming match has no margin and no played rounds", () => {
        const upcoming = match([
            player("a", "Ace", 0),
            player("b", "Bee", 0),
        ], "UPCOMING")
        const stats = statisticsFor(upcoming, ROUNDS)
        expect(stats.rounds).toEqual([])
        expect(stats.margin).toBeNull()
        expect(stats.roundWins).toBeNull()
        expect(stats.topScore).toBe(0)
    })

    it("one player alone: totals without a margin", () => {
        const solo = statisticsFor(match([player("a", "Ace", 30, { "Về đích": 30 })]), ROUNDS)
        expect(solo.margin).toBeNull()
        expect(solo.averageScore).toBe(30)
        expect(solo.roundWins).toEqual({ names: ["Ace"], count: 1 })
    })

    it("round scores naming no listed round still total correctly", () => {
        const stray = match([player("a", "Ace", 25, { "Unknown round": 25 })])
        const stats = statisticsFor(stray, ROUNDS)
        expect(stats.rounds).toEqual([])
        expect(stats.totalPoints).toBe(25)
    })
})
