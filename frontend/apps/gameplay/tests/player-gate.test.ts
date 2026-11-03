import { describe, expect, it } from "vitest"
import { gateOf } from "@/lib/player-gate"
import { lobbyHintOf, NOT_LIVE_HINT } from "@/lib/lobby-hint"

// The player's stuck-screens. Each status is an ANSWER from the backend, not a
// failure to retry, so the table decides whether a player is told to rejoin, to
// call the operator, or to simply wait — getting it wrong strands them.

describe("gateOf — the status codes are answers", () => {
    it("sends an expired session to the PIN card", () => {
        expect(gateOf({ failureStatus: 401, hasView: false })).toBe("unauthorized")
        expect(gateOf({ failureStatus: 401, hasView: true })).toBe("unauthorized")
    })

    it("sends a foreign seat to the PIN card", () => {
        expect(gateOf({ failureStatus: 403, hasView: false })).toBe("not-seated")
    })

    it("waits in the lobby while the match is not LIVE", () => {
        expect(gateOf({ failureStatus: 409, hasView: false })).toBe("not-live")
    })

    it("shows the loading gate before the first paint", () => {
        expect(gateOf({ failureStatus: undefined, hasView: false })).toBe("loading")
    })

    it("lets a painted view through with no gate at all", () => {
        expect(gateOf({ failureStatus: undefined, hasView: true })).toBeNull()
    })

    it("does not gate a painted view on an unrelated status", () => {
        expect(gateOf({ failureStatus: 500, hasView: true })).toBeNull()
    })
})

describe("lobbyHintOf — why the lobby is showing", () => {
    it("tells the player to call the operator when the round has no player screen", () => {
        const hint = lobbyHintOf("khong-ton-tai", "phase1")
        expect(hint).toContain("ban điều hành")
    })

    it("uses the same hint for an unknown STAGE of a known round", () => {
        expect(lobbyHintOf("khoi-dong", "unknown")).toContain("ban điều hành")
    })

    it("says the round ended, and that the console moves on", () => {
        const hint = lobbyHintOf("ve-dich", "ended")
        expect(hint).toContain("kết thúc")
        expect(hint).not.toContain("ban điều hành")
    })

    it("says the round has not started yet on any running stage", () => {
        expect(lobbyHintOf("khoi-dong", "phase1")).toContain("bắt đầu")
        expect(lobbyHintOf("giai-ma", "phase2")).toContain("bắt đầu")
    })

    it("keeps the not-LIVE hint separate from the waiting hint", () => {
        // two different waits: one is the MATCH, one is the ROUND
        expect(NOT_LIVE_HINT).toContain("mở trận")
        expect(lobbyHintOf("khoi-dong", "phase1")).not.toBe(NOT_LIVE_HINT)
    })
})
