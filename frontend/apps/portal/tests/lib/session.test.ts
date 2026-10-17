import { describe, expect, it } from "vitest"
import { ApiError } from "@shared/lib/api"
import { isUnauthorized } from "@/lib/session"

describe("isUnauthorized", () => {
    it("treats 401 as signed out, not an error", () => {
        expect(isUnauthorized(new ApiError(401, "nope"))).toBe(true)
    })

    it("does not swallow other errors", () => {
        expect(isUnauthorized(new ApiError(500, "boom"))).toBe(false)
        expect(isUnauthorized(new Error("boom"))).toBe(false)
        expect(isUnauthorized(undefined)).toBe(false)
    })
})