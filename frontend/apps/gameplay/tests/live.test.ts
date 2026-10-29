import { describe, expect, it } from "vitest"
import { playerScreenOf, type LiveView } from "../src/lib/live"

// A view factory: only the fields playerScreenOf reads are varied; everything
// else arrives as the empty-but-well-formed shape the server would send.
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

describe("playerScreenOf — the lobby", () => {
    it("a round the MC has not started is the lobby", () => {
        expect(playerScreenOf(view({ stage: "pending" }))).toBe("lobby")
        expect(playerScreenOf(view({ roundId: "ve-dich", stage: "pending" }))).toBe("lobby")
    })

    it("an ended round is the lobby — waiting for the MC to advance", () => {
        expect(playerScreenOf(view({ roundId: "giai-ma", stage: "ended" }))).toBe("lobby")
        expect(playerScreenOf(view({ roundId: "but-pha", stage: "ended" }))).toBe("lobby")
        expect(playerScreenOf(view({ roundId: "ve-dich", stage: "ended" }))).toBe("lobby")
    })

    it("an ended round is the lobby for EVERY round — one rule, no exceptions", () => {
        // The khoi-dong engine never sends "ended" (it stops at phase2), but the
        // waiting-stage rule still covers it — no round-specific branch anywhere.
        expect(playerScreenOf(view({ roundId: "khoi-dong", stage: "ended" }))).toBe("lobby")
    })
})

describe("playerScreenOf — khoi-dong", () => {
    it("phase 1 is the rieng screen, phase 2 the chung", () => {
        expect(playerScreenOf(view({ roundId: "khoi-dong", stage: "phase1" }))).toBe("khoi-dong-rieng")
        expect(playerScreenOf(view({ roundId: "khoi-dong", stage: "phase2" }))).toBe("khoi-dong-chung")
    })

    it("a stage khoi-dong never has degrades to the rieng layout", () => {
        expect(playerScreenOf(view({ roundId: "khoi-dong", stage: "phase3" }))).toBe("khoi-dong-rieng")
    })
})

describe("playerScreenOf — giai-ma and but-pha", () => {
    it("giai-ma plays one screen: windows open or not", () => {
        expect(playerScreenOf(view({ roundId: "giai-ma", stage: "hints" }))).toBe("giai-ma")
        expect(playerScreenOf(
            view({ roundId: "giai-ma", stage: "hints", open: openWindow("h2") })
        )).toBe("giai-ma")
    })

    it("but-pha plays its sprint screen", () => {
        expect(playerScreenOf(view({ roundId: "but-pha", stage: "question" }))).toBe("but-pha")
    })
})

describe("playerScreenOf — ve-dich", () => {
    it("no open question is the board, in both phases", () => {
        expect(playerScreenOf(view({ roundId: "ve-dich", stage: "phase1" }))).toBe("ve-dich-pick")
        expect(playerScreenOf(view({ roundId: "ve-dich", stage: "phase2" }))).toBe("ve-dich-pick")
    })

    it("an open question splits by phase: typed chung, oral rieng", () => {
        expect(playerScreenOf(
            view({ roundId: "ve-dich", stage: "phase1", open: openWindow("q1") })
        )).toBe("ve-dich-chung")
        expect(playerScreenOf(
            view({ roundId: "ve-dich", stage: "phase2", open: openWindow("q1") })
        )).toBe("ve-dich-rieng")
    })
})

describe("playerScreenOf — degrading kindly", () => {
    it("an unknown round is ALWAYS the lobby — it has no screen", () => {
        expect(playerScreenOf(view({ roundId: "mystery-round", stage: "question" }))).toBe("lobby")
        expect(playerScreenOf(
            view({ roundId: "mystery-round", stage: "question", open: openWindow("q1") })
        )).toBe("lobby")
        expect(playerScreenOf(view({ roundId: "mystery-round", stage: "pending" }))).toBe("lobby")
        expect(playerScreenOf(view({ roundId: "mystery-round", stage: "phase2" }))).toBe("lobby")
    })
})
