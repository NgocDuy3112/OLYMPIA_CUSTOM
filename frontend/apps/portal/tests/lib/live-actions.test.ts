import { describe, expect, it } from "vitest"

import { startAction, type LiveAction } from "@/lib/live-actions"
import type { ConsoleQuestion } from "@/lib/live"


const question = (over: Partial<ConsoleQuestion>): ConsoleQuestion => ({
    _id: "q",
    kind: "CHOICE",
    roundId: "giai-ma",
    turnId: "t",
    position: 0,
    questionText: "?",
    timeLimit: null,
    points: 10,
    payload: {},
    ...over,
})

describe("startAction", () => {
    it("giai-ma carries the field and the hint order (keyword excluded, position-sorted)", () => {
        const questions = [
            question({ _id: "b", position: 2 }),
            question({ _id: "a", position: 1 }),
            question({ _id: "kw", kind: "KEYWORD", turnId: "keyword", position: 0 }),
            question({ _id: "other", roundId: "but-pha", position: 0 }),
        ]
        expect(startAction("giai-ma", { playerIds: ["p1", "p2"], questions })).toEqual({
            kind: "giai-ma.start",
            playerIds: ["p1", "p2"],
            hintIds: ["a", "b"],
        })
    })

    it("every other known round starts bare — phase 2 only when asked", () => {
        const questions = [question({})]
        expect(startAction("khoi-dong", { playerIds: ["p1"], questions }))
            .toEqual({ kind: "khoi-dong.start" })
        expect(startAction("but-pha", { playerIds: ["p1"], questions }))
            .toEqual({ kind: "but-pha.start" })
        expect(startAction("ve-dich", { playerIds: ["p1"], questions }))
            .toEqual({ kind: "ve-dich.start" })

        expect(startAction("khoi-dong", { phase: 2, playerIds: ["p1"], questions }))
            .toEqual({ kind: "khoi-dong.start", phase: 2 })
        expect(startAction("ve-dich", { phase: 2, playerIds: ["p1"], questions }))
            .toEqual({ kind: "ve-dich.start", phase: 2 })
        expect(startAction("giai-ma", { phase: 2, playerIds: ["p1"], questions }))
            .toEqual({ kind: "giai-ma.start", playerIds: ["p1"], hintIds: ["q"] })
    })

    it("an unknown round returns null — never a kind the backend would 400", () => {
        expect(startAction("mystery", { playerIds: [], questions: [] })).toBeNull()
        expect(startAction("", { playerIds: [], questions: [] })).toBeNull()
    })

    it("every start it builds is a LiveAction (type-level, asserted at runtime)", () => {
        const built: Array<LiveAction | null> = [
            startAction("giai-ma", { playerIds: ["p"], questions: [] }),
            startAction("khoi-dong", { playerIds: [], questions: [] }),
            startAction("but-pha", { playerIds: [], questions: [] }),
            startAction("ve-dich", { playerIds: [], questions: [] }),
        ]
        for (const action of built) expect(action).not.toBeNull()
    })
})
