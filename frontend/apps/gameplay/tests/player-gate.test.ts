import { describe, expect, it } from "vitest"
import { gateOf } from "@/lib/player-gate"
import { lobbyHintOf, NOT_LIVE_HINT } from "@/lib/lobby-hint"


describe("gateOf — the status codes are answers", () => {
    it("sends an expired session to the login door", () => {
        expect(gateOf({ failureStatus: 401, hasView: false })).toBe("unauthorized")
        expect(gateOf({ failureStatus: 401, hasView: true })).toBe("unauthorized")
    })

    it("sends a foreign seat to the login door", () => {
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

    it("never exposes round pause or end states — the hint stays neutral", () => {
        for (const stage of ["phase1", "phase2", "ended", "lobby"]) {
            expect(lobbyHintOf("khoi-dong", stage)).toBe(NOT_LIVE_HINT)
            expect(lobbyHintOf("ve-dich", stage)).toBe(NOT_LIVE_HINT)
            expect(lobbyHintOf("ve-dich", stage)).toBe(NOT_LIVE_HINT)
        }
    })

    it("keeps the not-LIVE hint neutral", () => {
        expect(NOT_LIVE_HINT).toBe("Trận đấu sắp sửa diễn ra.")
    })
})
