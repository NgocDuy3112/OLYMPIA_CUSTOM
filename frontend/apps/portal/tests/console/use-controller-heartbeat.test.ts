import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useControllerHeartbeat } from "@/console/model/use-controller-heartbeat"
import { stubFetch } from "../helpers/render"

const BEAT_URL = "POST /portal/tournaments/t1/matches/m1/live/heartbeat"

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

const flush = () =>
    act(async () => {
        await Promise.resolve()
    })

describe("the controller heartbeat", () => {
    it("beats on mount and keeps beating inside the lease", async () => {
        vi.useFakeTimers()
        const fetchMock = stubFetch({ [BEAT_URL]: { body: { id: "u1", name: "Ada", active: true } } })

        const { result } = renderHook(() => useControllerHeartbeat("t1", "m1"))
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(result.current).toBeNull()

        await act(async () => {
            vi.advanceTimersByTime(30_000)
        })
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("stops beating and reports the holder when the server refuses", async () => {
        vi.useFakeTimers()
        const fetchMock = stubFetch({
            [BEAT_URL]: {
                body: { error: "CONFLICT", message: "match is controlled by Ada" },
                status: 409,
            },
        })

        const { result } = renderHook(() => useControllerHeartbeat("t1", "m1"))
        await flush()
        expect(result.current).toBe("match is controlled by Ada")

        await act(async () => {
            vi.advanceTimersByTime(120_000)
        })
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
