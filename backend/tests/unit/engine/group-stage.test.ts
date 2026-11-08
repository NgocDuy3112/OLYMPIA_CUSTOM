import { describe, expect, it } from "vitest"
import {
    averages,
    buildGroupStandings,
    countedScore,
    phaseOfStage,
    teamPointsFor,
    type GroupMatchInput,
    type GroupLabel
} from "../../../src/game/engine/scoring/group-stage.js"


describe("phaseOfStage", () => {
    it("maps only the two group stages to a phase", () => {
        expect(phaseOfStage("phase-1")).toBe(1)
        expect(phaseOfStage("phase-2")).toBe(2)
        expect(phaseOfStage("playin-1")).toBeNull()
        expect(phaseOfStage("playoff-1")).toBeNull()
        expect(phaseOfStage("final")).toBeNull()
    })
})

describe("teamPointsFor", () => {
    it("pays exactly the drawn scale", () => {
        expect(teamPointsFor(1, 3, 1)).toBe(2)
        expect(teamPointsFor(1, 3, 2)).toBe(0)
        expect(teamPointsFor(1, 4, 1)).toBe(3)
        expect(teamPointsFor(1, 4, 2)).toBe(1)
        expect(teamPointsFor(1, 4, 3)).toBe(0)
        expect(teamPointsFor(2, 3, 1)).toBe(1)
        expect(teamPointsFor(2, 4, 1)).toBe(2)
        expect(teamPointsFor(2, 4, 2)).toBe(0)
    })

    it("pays nothing outside the table", () => {
        expect(teamPointsFor(1, 2, 1)).toBe(0)      
        expect(teamPointsFor(1, 4, 0)).toBe(0)      
        expect(teamPointsFor(1, 4, 9)).toBe(0)
    })
})

describe("countedScore / averages", () => {
    it("clamps a negative Phase 1 score to 0 when counted, Phase 2 counts raw", () => {
        expect(countedScore(1, -8)).toBe(0)
        expect(countedScore(2, -8)).toBe(-8)
        expect(countedScore(1, 12)).toBe(12)
    })

    it("averages over the matches PLAYED, never a fixed count, per phase and pooled", () => {
        const avg = averages([
            { phase: 1, rawScore: 10 },
            { phase: 1, rawScore: -6 },        // counted as 0 in Phase 1
            { phase: 2, rawScore: 20 }
        ])
        expect(avg.phase1).toBe(5)              
        expect(avg.phase2).toBe(20)
        expect(avg.all).toBe(10)                
    })

    it("has no average for a scope with no matches", () => {
        expect(averages([])).toEqual({ phase1: null, phase2: null, all: null })
        expect(averages([{ phase: 2, rawScore: 5 }]).phase1).toBeNull()
    })
})

describe("buildGroupStandings", () => {
    const roster = new Map<string, GroupLabel>([
        ["u1", "A"], ["u2", "A"], ["u3", "B"], ["u4", "B"],
        ["idle", "A"]                          
    ])

    const matches: GroupMatchInput[] = [
        { phase: 1, results: [{ userId: "u1", rank: 1, rawScore: 40 }, { userId: "u2", rank: 2, rawScore: 30 }, { userId: "u3", rank: 3, rawScore: 20 }, { userId: "u4", rank: 4, rawScore: 10 }] },
        { phase: 2, results: [{ userId: "u3", rank: 1, rawScore: 25 }, { userId: "u1", rank: 2, rawScore: 15 }, { userId: "u4", rank: 3, rawScore: -5 }] }
    ]

    it("banks points to the contestant's group by finishing order", () => {
        const t = buildGroupStandings(roster, matches)
        expect(t.byGroup.A.teamPoints).toBe(4)          
        expect(t.byGroup.B.teamPoints).toBe(1)          
        const u1 = t.byGroup.A.contestants.find((c) => c.userId === "u1")!
        expect(u1.bankedPoints).toBe(3)
        expect(u1.matchesPlayed).toBe(2)
        expect(t.byGroup.A.contestants.find((c) => c.userId === "u2")!.bankedPoints).toBe(1)
    })

    it("orders a group by banked points, and a never-played contestant sits last", () => {
        const t = buildGroupStandings(roster, matches)
        expect(t.byGroup.A.contestants.map((c) => c.userId)).toEqual(["u1", "u2", "idle"])
    })

    it("leaves contestants with no group out of the tables entirely", () => {
        const t = buildGroupStandings(roster, [
            { phase: 1, results: [{ userId: "stranger", rank: 1, rawScore: 99 }] }
        ])
        expect(t.byGroup.A.teamPoints).toBe(0)
        expect(t.byGroup.B.teamPoints).toBe(0)
    })

    it("the wildcard table holds only players who played, best avg first", () => {
        const t = buildGroupStandings(roster, matches)
        expect(t.wildcard.map((l) => [l.userId, l.avg])).toEqual([
            ["u2", 30], ["u1", 27.5], ["u3", 22.5], ["u4", 2.5]
        ])
        expect(t.wildcard.some((l) => l.userId === "idle")).toBe(false)
    })
})
