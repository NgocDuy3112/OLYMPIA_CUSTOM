import { describe, expect, it } from "vitest"

import { ketThucPlanOf, railVariantOf } from "@/rounds"
import { hetLuotAction } from "@/rounds/ve-dich/logic"
import type { QuestionAnswerRow } from "@/lib/live"

// The controller's round RULES, table-tested through the registry: which rail
// each round draws and the two action planners behind the deck's buttons
// (Kết thúc / Hết lượt). A new ruleset = a new module + rows here.

type PlanInput = Parameters<typeof ketThucPlanOf>[1]

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
    stage: "phase2",
    roundEnded: false,
    hasOralRun: false,
    openIds: [],
    rows: [],
    overrides: {},
    ...over,
})

const row = (userId: string, verdict: QuestionAnswerRow["verdict"], judged: boolean): QuestionAnswerRow => ({
    userId,
    value: { text: "đáp án" },
    verdict,
    judged,
    pointsAwarded: verdict === "CORRECT" ? 10 : 0,
})

describe("railVariantOf — identity cards vs answer rows", () => {
    it("the personal rounds draw compact cards; the judging rounds draw answer rows", () => {
        // khoi-dong's oral round (and an unknown round's phase 1)
        expect(railVariantOf({ roundId: "khoi-dong", stage: "phase1", veDichPhase: null })).toBe("compact")
        expect(railVariantOf({ roundId: "mystery", stage: "phase1", veDichPhase: null })).toBe("compact")
        // khoi-dong's batch round (and an unknown round's phase 2)
        expect(railVariantOf({ roundId: "khoi-dong", stage: "phase2", veDichPhase: null })).toBe("answers")
        expect(railVariantOf({ roundId: "mystery", stage: "phase2", veDichPhase: null })).toBe("answers")
        // the fixed judging rounds
        expect(railVariantOf({ roundId: "giai-ma", stage: "hints", veDichPhase: null })).toBe("answers")
        expect(railVariantOf({ roundId: "but-pha", stage: "question", veDichPhase: null })).toBe("answers")
        // ve-dich: phase 1 judges with answer rows, phase 2 shows identity cards
        expect(railVariantOf({ roundId: "ve-dich", stage: "phase1", veDichPhase: 1 })).toBe("answers")
        expect(railVariantOf({ roundId: "ve-dich", stage: "phase2", veDichPhase: 2 })).toBe("compact")
    })
})

describe("ketThucPlanOf — what Kết thúc sends", () => {
    it("an ended round just advances to the hall, whatever round it is", () => {
        expect(ketThucPlanOf("ve-dich", input({ roundEnded: true })))
            .toEqual([{ kind: "round.advance" }])
    })

    it("an unknown round plans nothing — the lobby owns it", () => {
        expect(ketThucPlanOf("mystery", input())).toEqual([])
    })

    it("khoi-dong phase 1: time out the open run, or move to phase 2 when complete", () => {
        expect(ketThucPlanOf("khoi-dong", input({ stage: "phase1", hasOralRun: true })))
            .toEqual([{ kind: "khoi-dong.timeOutRun" }])
        expect(ketThucPlanOf("khoi-dong", input({ stage: "phase1", hasOralRun: false })))
            .toEqual([{ kind: "khoi-dong.beginPhase2" }])
    })

    it("khoi-dong phase 2: finalize staged verdicts for OPEN questions only, then end", () => {
        const plan = ketThucPlanOf("khoi-dong", input({
            openIds: ["q1"],
            overrides: { "q1:u1": true, "q1:u2": false, "q2:u3": true },
        }))
        expect(plan).toEqual([
            {
                kind: "khoi-dong.finalize",
                questionId: "q1",
                verdicts: [
                    { playerId: "u1", correct: true },
                    { playerId: "u2", correct: false },
                ],
            },
            { kind: "khoi-dong.endRound" },
        ])
    })

    it("khoi-dong phase 2 without staged verdicts just ends", () => {
        expect(ketThucPlanOf("khoi-dong", input({ openIds: ["q1"] })))
            .toEqual([{ kind: "khoi-dong.endRound" }])
    })

    it("giai-ma: closes the open hint window, else ends the round", () => {
        expect(ketThucPlanOf("giai-ma", input({ stage: "hints", openIds: ["h1"] })))
            .toEqual([{ kind: "giai-ma.closeHintWindow" }])
        expect(ketThucPlanOf("giai-ma", input({ stage: "hints" })))
            .toEqual([{ kind: "giai-ma.endRound" }])
    })

    it("but-pha: no open question ends the round", () => {
        expect(ketThucPlanOf("but-pha", input({ stage: "question" })))
            .toEqual([{ kind: "but-pha.endRound" }])
    })

    it("but-pha: an unjudged ledger finalizes first, then closes — judged rows just close", () => {
        expect(ketThucPlanOf("but-pha", input({
            stage: "question",
            openIds: ["b1"],
            rows: [row("u1", "CORRECT", true), row("u2", null, false)],
            overrides: { "b1:u2": true },
        }))).toEqual([
            {
                kind: "but-pha.finalize",
                questionId: "b1",
                verdicts: [
                    { playerId: "u1", correct: true },
                    { playerId: "u2", correct: true }, // MC's staged flip wins
                ],
            },
            { kind: "but-pha.closeQuestion" },
        ])

        expect(ketThucPlanOf("but-pha", input({
            stage: "question",
            openIds: ["b1"],
            rows: [row("u1", "INCORRECT", true)],
        }))).toEqual([{ kind: "but-pha.closeQuestion" }])
    })

    it("ve-dich: the round just ends — Hết lượt owns the open question", () => {
        expect(ketThucPlanOf("ve-dich", input({ stage: "phase2", openIds: ["v1"] })))
            .toEqual([{ kind: "ve-dich.endRound" }])
    })
})

describe("hetLuotAction — what Hết lượt sends", () => {
    it("is null while the answerer has no verdict", () => {
        expect(hetLuotAction({ answererVerdict: null, buzzerId: null, buzzerVerdict: null })).toBeNull()
    })

    it("resolves with the answerer's verdict when nobody buzzed", () => {
        expect(hetLuotAction({ answererVerdict: "CORRECT", buzzerId: null, buzzerVerdict: null }))
            .toEqual({ kind: "ve-dich.resolve", answerer: true })
        expect(hetLuotAction({ answererVerdict: "INCORRECT", buzzerId: null, buzzerVerdict: null }))
            .toEqual({ kind: "ve-dich.resolve", answerer: false })
    })

    it("carries the buzzer's verdict too — and waits while it is missing", () => {
        expect(hetLuotAction({ answererVerdict: "INCORRECT", buzzerId: "u2", buzzerVerdict: "CORRECT" }))
            .toEqual({ kind: "ve-dich.resolve", answerer: false, buzzer: true })
        expect(hetLuotAction({ answererVerdict: "CORRECT", buzzerId: "u2", buzzerVerdict: null })).toBeNull()
    })
})
