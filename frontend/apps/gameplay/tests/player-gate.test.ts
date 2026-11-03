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
    it("says the round does not exist when it has no player screen", () => {
        expect(lobbyHintOf("khong-ton-tai", "phase1")).toBe("Vòng thi không tồn tại.")
    })

    it("uses the same hint for an unknown STAGE of a known round", () => {
        expect(lobbyHintOf("khoi-dong", "unknown")).toBe("Vòng thi không tồn tại.")
    })

    it("says the round ended", () => {
        expect(lobbyHintOf("ve-dich", "ended")).toBe("Trận đấu đã kết thúc.")
    })

    it("says the round is coming on any running stage", () => {
        for (const stage of ["phase1", "phase2"]) {
            expect(lobbyHintOf("khoi-dong", stage)).toBe("Trận đấu sẽ tiếp tục sau một ít thời gian")
        }
    })

    it("keeps the not-LIVE hint separate from the waiting hint", () => {
        // two different waits: one is the MATCH, one is the ROUND
        expect(NOT_LIVE_HINT).toBe("Trận đấu sắp sửa diễn ra.")
        expect(lobbyHintOf("khoi-dong", "phase1")).not.toBe(NOT_LIVE_HINT)
    })
})
