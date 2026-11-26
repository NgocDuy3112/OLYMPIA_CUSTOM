import { describe, expect, it } from "vitest"
import { consoleOf, liveResponseOf, WireError } from "../wire/live"
import type { RawLiveResponse } from "../wire/live"
import type { AnswerWindow } from "../wire/tiebreak"
import type { AuditEventRow } from "../wire/audit"

const giaiMa = {
    hintsRemaining: ["q1"],
    hintsPicked: [],
    openHintId: null,
    windowOpen: false,
    players: [{ id: "u1", keywordLocked: false, eliminated: false }],
}

const veDich = {
    phase: 2 as const,
    turnPlayerId: "u1",
    openStage: null,
    answererId: null,
    buzzerId: null,
    powersLeft: [],
    stagedPower: null,
    turnPowerUsed: false,
}

const khoiDong = {
    stage: "phase1" as const,
    ended: false,
    phase2Begun: false,
    phase2Closed: false,
    questionIndex: 0,
    questionCount: 6,
    windowOpen: false,
}

const butPha = { questionId: "q1", opened: true }

describe("consoleOf", () => {
    it("returns the round's console facts under its own roundId", () => {
        expect(consoleOf("giai-ma", giaiMa)).toEqual({ roundId: "giai-ma", console: giaiMa })
        expect(consoleOf("ve-dich", veDich)).toEqual({ roundId: "ve-dich", console: veDich })
        expect(consoleOf("khoi-dong", khoiDong)).toEqual({ roundId: "khoi-dong", console: khoiDong })
        expect(consoleOf("but-pha", butPha)).toEqual({ roundId: "but-pha", console: butPha })
    })

    it("has no console facts before the round starts", () => {
        expect(consoleOf("giai-ma", null)).toBeNull()
        expect(consoleOf("", undefined)).toBeNull()
    })

    it("rejects the facts of another round instead of reinterpreting them", () => {
        expect(() => consoleOf("ve-dich", giaiMa)).toThrow(WireError)
        expect(() => consoleOf("giai-ma", veDich)).toThrow(/console state for round "giai-ma" has no "hintsRemaining"/)
    })

    it("rejects a round the wire has no console family for", () => {
        expect(() => consoleOf("tiebreak", giaiMa)).toThrow(/no console state for round "tiebreak"/)
    })
})

describe("liveResponseOf", () => {
    const base = {
        version: 1,
        roundId: "giai-ma",
        state: {},
        questions: [],
        projection: {},
        roundEnded: false,
        connected: [],
        controller: null,
    } as unknown as RawLiveResponse

    it("validates the raw console into the round's own console state", () => {
        expect(liveResponseOf({ ...base, console: giaiMa }).console).toEqual({
            roundId: "giai-ma",
            console: giaiMa,
        })
    })

    it("has no console state when the wire carries none", () => {
        expect(liveResponseOf({ ...base, console: null }).console).toBeNull()
    })

    it("rejects a console that belongs to another round", () => {
        expect(() => liveResponseOf({ ...base, console: veDich })).toThrow(WireError)
    })
})

describe("AnswerWindow", () => {
    it("omits the key of every field the window never set", () => {
        const window = { mode: "Buzz", eligibility: "Others", locked: false } satisfies AnswerWindow
        const keys: Array<keyof AnswerWindow> = ["mode", "eligibility", "locked"]

        expect(Object.keys(window)).toEqual(keys)
        expect(Object.keys(window)).not.toContain("buzzer")
    })
})

const auditRowFields: Array<keyof AuditEventRow> = [
    "id",
    "action",
    "actorId",
    "actorName",
    "targetId",
    "targetName",
    "matchId",
    "details",
    "ip",
    "userAgent",
    "createdAt",
]

type AuditRowExtra = Exclude<keyof AuditEventRow, (typeof auditRowFields)[number]>
type AuditRowMissing = Exclude<(typeof auditRowFields)[number], keyof AuditEventRow>

const auditRowHasNoExtraField: [AuditRowExtra] extends [never] ? true : never = true
const auditRowHasNoMissingField: [AuditRowMissing] extends [never] ? true : never = true

describe("AuditEventRow", () => {
    it("declares exactly the contract's eleven fields", () => {
        const row = {
            id: "e1",
            action: "login",
            actorId: null,
            actorName: null,
            targetId: null,
            targetName: null,
            matchId: null,
            details: { ok: true },
            ip: null,
            userAgent: null,
            createdAt: "2026-11-26T12:24:07.137664Z",
        } satisfies AuditEventRow

        expect(Object.keys(row)).toEqual(auditRowFields)
        expect(auditRowHasNoExtraField).toBe(true)
        expect(auditRowHasNoMissingField).toBe(true)
    })
})
