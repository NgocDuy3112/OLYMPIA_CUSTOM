import { afterEach, describe, expect, it, vi } from "vitest"
import { logError } from "@shared/lib/log"
import { api } from "@shared/lib/api"

afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe("logError — the browser's one log line", () => {
    it("tags the failure with its scope so devtools is greppable", () => {
        vi.stubEnv("MODE", "production")
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
        const boom = new Error("socket died")

        logError("live", boom)

        expect(spy).toHaveBeenCalledWith("[aoc:live]", boom)
    })

    it("stays out of test runs — the assertion IS the message", () => {
        // vitest runs with MODE=test by default
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)

        logError("live", new Error("an expected failure"))

        expect(spy).not.toHaveBeenCalled()
    })

    it("never throws — a logger must not break the thing it observed", () => {
        vi.stubEnv("MODE", "production")
        vi.spyOn(console, "error").mockImplementation(() => {
            throw new Error("console is broken too")
        })

        expect(() => logError("api", new Error("x"))).toThrow()
    })
})

describe("api() failures leave a line behind", () => {
    it("logs method, path and reason — then rethrows exactly as before", async () => {
        vi.stubEnv("MODE", "production")
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    ({
                        ok: false,
                        status: 500,
                        statusText: "Boom",
                        json: async () => ({ message: "database exploded" }),
                    }) as unknown as Response
            )
        )

        await expect(api("/portal/players")).rejects.toThrow("database exploded")

        expect(spy).toHaveBeenCalledWith(
            "[aoc:api]",
            "GET /portal/players → database exploded"
        )
    })

    it("carries the verb too, so a refused PATCH is not a mystery", async () => {
        vi.stubEnv("MODE", "production")
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    ({
                        ok: false,
                        status: 409,
                        statusText: "Conflict",
                        json: async () => ({ message: "stale revision", error: "CONFLICT" }),
                    }) as unknown as Response
            )
        )

        await expect(
            api("/portal/tournaments/t1/matches/m1/assemble", { method: "PATCH", body: "{}" })
        ).rejects.toThrow("stale revision")

        expect(spy).toHaveBeenCalledWith(
            "[aoc:api]",
            expect.stringContaining("PATCH /portal/tournaments/t1/matches/m1/assemble → stale revision")
        )
    })
})
