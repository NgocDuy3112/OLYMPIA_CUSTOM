import { describe, expect, it, vi } from "vitest"
import { probeMediaPermission } from "@shared/lib/rtc"

// The player's camera/mic are asked for ON ARRIVAL, not when the match goes LIVE.
// Publishing needs a token that is refused (409) until then — without the probe the
// browser dialog would appear mid-show, at the moment a round starts.

const streamOf = () => {
    const stop = vi.fn()
    return { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream
}

// what a browser actually throws — mediaErrorOf keys on DOMException
const domError = (name: string) => new DOMException(name, name)

describe("probeMediaPermission", () => {
    it("asks for video and audio, and releases every track", async () => {
        const stop = vi.fn()
        const asked: MediaStreamConstraints[] = []
        const getUserMedia = async (constraints: MediaStreamConstraints) => {
            asked.push(constraints)
            return { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream
        }

        const refusal = await probeMediaPermission({ getUserMedia })

        expect(asked).toEqual([{ video: true }, { audio: true }])
        // two asks × two tracks released — nothing stays open
        expect(stop).toHaveBeenCalledTimes(4)
        expect(refusal).toBeNull()
    })

    it("reports a blocked camera in the app's words", async () => {
        const refusal = await probeMediaPermission({
            getUserMedia: async () => { throw domError("NotAllowedError") },
        })
        expect(refusal).toMatch(/chặn quyền camera\/mic/)
    })

    it("still asks for the mic when the camera is refused — and reports it", async () => {
        const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
            if (constraints.video) throw domError("NotAllowedError")
            return streamOf()
        })
        const refusal = await probeMediaPermission({ getUserMedia })

        expect(getUserMedia).toHaveBeenCalledTimes(2)
        expect(refusal).toMatch(/chặn quyền/)
    })

    it("says a missing device is missing, not blocked", async () => {
        const refusal = await probeMediaPermission({
            getUserMedia: async () => { throw domError("NotFoundError") },
        })
        expect(refusal).toMatch(/Không tìm thấy camera/)
    })
})
