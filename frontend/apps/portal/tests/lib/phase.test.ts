import { describe, expect, it } from "vitest"
import { readinessOf, type ReadinessInput } from "@/console/lib/phase"

// The console's gate: does a round screen draw, and must the lobby be asked for?
// Every row here is a screen an operator either sees or does not — a wrong row
// is a dead deck or a deck drawing a round that already ended.

function input(over: Partial<ReadinessInput> = {}): ReadinessInput {
    return {
        entered: false,
        atWaiting: false,
        roundsView: false,
        roundId: "khoi-dong",
        stage: "phase1",
        viewPainted: true,
        transportRefused: false,
        ...over
    }
}

describe("readinessOf — the deck draws", () => {
    it("draws a live round stage", () => {
        expect(readinessOf(input())).toEqual({ roundScreenReady: true, waiting: false })
    })

    it("does not ask for the lobby while the deck is drawing", () => {
        expect(readinessOf(input()).waiting).toBe(false)
    })

    it("draws every running stage of every known round", () => {
        for (const roundId of ["khoi-dong", "giai-ma", "but-pha", "ve-dich"]) {
            for (const stage of ["phase1", "phase2"]) {
                expect(readinessOf(input({ roundId, stage })).roundScreenReady).toBe(true)
            }
        }
    })
})

describe("readinessOf — the waiting room", () => {
    it("sends a waiting stage to the lobby, for every known round", () => {
        for (const roundId of ["khoi-dong", "giai-ma", "but-pha", "ve-dich"]) {
            for (const stage of ["pending", "ended", "unknown"]) {
                expect(readinessOf(input({ roundId, stage }))).toEqual({ roundScreenReady: false, waiting: true })
            }
        }
    })

    it("sends an unknown round to the lobby even mid-stage (no module to draw)", () => {
        expect(readinessOf(input({ roundId: "khong-ton-tai", stage: "phase1" })).waiting).toBe(true)
    })

    it("lets the operator NAVIGATE into a waiting stage (a saved ENDED re-opened for review)", () => {
        expect(readinessOf(input({ stage: "ended", entered: true }))).toEqual({ roundScreenReady: true, waiting: false })
    })

    it("has Về sảnh outrank a navigation — the deck stops drawing", () => {
        expect(readinessOf(input({ stage: "phase1", entered: true, atWaiting: true })).waiting).toBe(true)
    })

    it("has Về sảnh outrank a live stage even without a navigation", () => {
        expect(readinessOf(input({ atWaiting: true })).roundScreenReady).toBe(false)
    })

    it("does not draw a round behind the rounds navigator", () => {
        expect(readinessOf(input({ roundsView: true })).waiting).toBe(true)
    })
})

describe("readinessOf — transport failure", () => {
    it("waits (for the lobby answer) when the live read failed", () => {
        expect(readinessOf(input({ transportRefused: true })).waiting).toBe(true)
    })

    it("waits before the first paint, whatever the stage claims", () => {
        expect(readinessOf(input({ viewPainted: false })).waiting).toBe(true)
    })
})
