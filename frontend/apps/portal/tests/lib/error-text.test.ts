import { describe, expect, it } from "vitest"
import { ApiError } from "@shared/lib/api"
import { errorMessage } from "@shared/lib/error-text"

describe("errorMessage", () => {
    it("reads the server's message off an ApiError", () => {
        expect(errorMessage(new ApiError(409, "tournament t1 still has a LIVE match"))).toBe(
            "tournament t1 still has a LIVE match"
        )
    })

    it("reads a plain Error", () => {
        expect(errorMessage(new Error("network down"))).toBe("network down")
    })

    it("stringifies anything else", () => {
        expect(errorMessage("boom")).toBe("boom")
    })
})
