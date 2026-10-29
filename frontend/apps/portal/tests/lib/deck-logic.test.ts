import { describe, expect, it } from "vitest"

import { hetLuotAction, ketThucPlan, railVariantOf, slideOf, type KetThucInput } from "@/lib/deck-logic"
import type { QuestionAnswerRow } from "@/lib/live"

// The MC console's decisions, table-tested: slide derivation, the rail variant,
// and the two action planners behind the deck's buttons (Kết thúc / Hết lượt).

const input = (over: Partial<KetThucInput> = {}): KetThucInput => ({
    roundId: "khoi-dong",
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

describe("slideOf — which slide the deck shows", () => {
    it("maps the simple rounds: giai-ma → 3, but-pha → 4", () => {
        expect(slideOf({ roundId: "giai-ma", stage: "hints", openCount: 0, veDichPhase: null })).toBe(3)
        expect(slideOf({ roundId: "but-pha", stage: "question", openCount: 0, veDichPhase: null })).toBe(4)
    })

    it("khoi-dong and unknown rounds follow the phase", () => {
        expect(slideOf({ roundId: "khoi-dong", stage: "phase1", openCount: 0, veDichPhase: null })).toBe(1)
        expect(slideOf({ roundId: "khoi-dong", stage: "phase2", openCount: 0, veDichPhase: null })).toBe(2)
        expect(slideOf({ roundId: "mystery", stage: "phase2", openCount: 0, veDichPhase: null })).toBe(2)
    })

    it("ve-dich splits board (5/6) from question (7/8) by phase and openness", () => {
        expect(slideOf({ roundId: "ve-dich", stage: "phase1", openCount: 0, veDichPhase: 1 })).toBe(6)
        expect(slideOf({ roundId: "ve-dich", stage: "phase2", openCount: 0, veDichPhase: 2 })).toBe(5)
        expect(slideOf({ roundId: "ve-dich", stage: "phase1", openCount: 1, veDichPhase: 1 })).toBe(7)
        expect(slideOf({ roundId: "ve-dich", stage: "phase2", openCount: 1, veDichPhase: 2 })).toBe(8)
    })
})

describe("railVariantOf — identity cards vs answer rows", () => {
    it("board/turn slides draw compact cards; judging slides draw answer rows", () => {
        expect(railVariantOf(1)).toBe("compact")
        expect(railVariantOf(5)).toBe("compact")
        expect(railVariantOf(8)).toBe("compact")
        expect(railVariantOf(2)).toBe("answers")
        expect(railVariantOf(3)).toBe("answers")
        expect(railVariantOf(4)).toBe("answers")
        expect(railVariantOf(6)).toBe("answers")
        expect(railVariantOf(7)).toBe("answers")
    })
})

describe("ketThucPlan — what Kết thúc sends", () => {
    it("an ended round just advances to the hall, whatever round it is", () => {
        expect(ketThucPlan(input({ roundEnded: true, roundId: "ve-dich" })))
            .toEqual([{ kind: "round.advance" }])
    })

    it("khoi-dong phase 1: time out the open run, or move to phase 2 when complete", () => {
        expect(ketThucPlan(input({ stage: "phase1", hasOralRun: true })))
            .toEqual([{ kind: "khoi-dong.timeOutRun" }])
        expect(ketThucPlan(input({ stage: "phase1", hasOralRun: false })))
            .toEqual([{ kind: "khoi-dong.beginPhase2" }])
    })

    it("khoi-dong phase 2: finalize staged verdicts for OPEN questions only, then end", () => {
        const plan = ketThucPlan(input({
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
        expect(ketThucPlan(input({ openIds: ["q1"] }))).toEqual([{ kind: "khoi-dong.endRound" }])
    })

    it("giai-ma: closes the open hint window, else ends the round", () => {
        expect(ketThucPlan(input({ roundId: "giai-ma", stage: "hints", openIds: ["h1"] })))
            .toEqual([{ kind: "giai-ma.closeHintWindow" }])
        expect(ketThucPlan(input({ roundId: "giai-ma", stage: "hints" })))
            .toEqual([{ kind: "giai-ma.endRound" }])
    })

    it("but-pha: no open question ends the round", () => {
        expect(ketThucPlan(input({ roundId: "but-pha", stage: "question" })))
            .toEqual([{ kind: "but-pha.endRound" }])
    })

    it("but-pha: an unjudged ledger finalizes first, then closes — judged rows just close", () => {
        const openQ = { roundId: "but-pha", openIds: ["b1"] }
        expect(ketThucPlan(input({
            ...openQ,
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

        expect(ketThucPlan(input({ ...openQ, rows: [row("u1", "INCORRECT", true)] })))
            .toEqual([{ kind: "but-pha.closeQuestion" }])
    })

    it("ve-dich: the round just ends — Hết lượt owns the open question", () => {
        expect(ketThucPlan(input({ roundId: "ve-dich", stage: "phase2", openIds: ["v1"] })))
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
