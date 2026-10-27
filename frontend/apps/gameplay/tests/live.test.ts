import { describe, expect, it } from "vitest"
import { screenFor, type LiveScreen, type LiveView } from "../src/lib/live"

// A view factory: only the fields screenFor reads are varied; everything else
// arrives as the empty-but-well-formed shape the server would send.
const view = (over: Partial<LiveView>): LiveView => ({
    matchId: "m1",
    roundId: "khoi-dong",
    version: 1,
    stage: "pending",
    open: [],
    table: [],
    me: {},
    ...over,
})

const openWindow = (questionId: string) => [
    { questionId, deadlineAt: "2026-01-01T00:00:15.000Z", question: null },
]

describe("screenFor — the lobby", () => {
    it("a round the MC has not started is the lobby", () => {
        expect(screenFor(view({ stage: "pending" }))).toBe("lobby")
    })

    it("an ended round is the lobby — waiting for the MC to advance", () => {
        expect(screenFor(view({ roundId: "giai-ma", stage: "ended" }))).toBe("lobby")
        expect(screenFor(view({ roundId: "but-pha", stage: "ended" }))).toBe("lobby")
        expect(screenFor(view({ roundId: "ve-dich", stage: "ended" }))).toBe("lobby")
    })
})

describe("screenFor — khoi-dong", () => {
    it("phase 1 is the oral screen, phase 2 the batch", () => {
        expect(screenFor(view({ roundId: "khoi-dong", stage: "phase1" }))).toBe("khoi-dong-oral")
        expect(screenFor(view({ roundId: "khoi-dong", stage: "phase2" }))).toBe("khoi-dong-batch")
    })

    it("a stage khoi-dong never has degrades to unknown", () => {
        expect(screenFor(view({ roundId: "khoi-dong", stage: "phase3" }))).toBe("unknown")
    })
})

describe("screenFor — giai-ma", () => {
    it("between windows it is idle; an open window wins", () => {
        expect(screenFor(view({ roundId: "giai-ma", stage: "hints" }))).toBe("giai-ma-idle")
        expect(screenFor(
            view({ roundId: "giai-ma", stage: "hints", open: openWindow("h2") })
        )).toBe("giai-ma-window")
    })

    it("a stage it does not know degrades to unknown", () => {
        expect(screenFor(view({ roundId: "giai-ma", stage: "picking" }))).toBe("unknown")
    })
})

describe("screenFor — but-pha and ve-dich", () => {
    it("but-pha plays its sprint screen", () => {
        expect(screenFor(view({ roundId: "but-pha", stage: "question" }))).toBe("but-pha")
    })

    it("ve-dich plays both phases on the same screen", () => {
        expect(screenFor(view({ roundId: "ve-dich", stage: "phase1" }))).toBe("ve-dich")
        expect(screenFor(view({ roundId: "ve-dich", stage: "phase2" }))).toBe("ve-dich")
    })
})

describe("screenFor — degrading kindly", () => {
    it("an unknown round never throws — it says unknown", () => {
        expect(screenFor(view({ roundId: "mystery-round", stage: "question" }))).toBe("unknown")
    })

    it("every view maps to exactly one screen", () => {
        const screens: LiveScreen[] = [
            "lobby", "khoi-dong-oral", "khoi-dong-batch", "giai-ma-window",
            "giai-ma-idle", "but-pha", "ve-dich", "unknown",
        ]
        const samples = [
            view({ stage: "pending" }),
            view({ stage: "phase1" }),
            view({ stage: "phase2" }),
            view({ roundId: "giai-ma", stage: "hints", open: openWindow("h1") }),
            view({ roundId: "giai-ma", stage: "hints" }),
            view({ roundId: "but-pha", stage: "question" }),
            view({ roundId: "ve-dich", stage: "phase2" }),
            view({ roundId: "mystery", stage: "question" }),
        ]
        expect(samples.map(screenFor)).toEqual(screens)
    })
})
