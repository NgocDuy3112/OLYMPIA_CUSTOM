import { act, renderHook } from "@testing-library/react"
import type { Room } from "livekit-client"
import { describe, expect, it, vi } from "vitest"
import { useRtcPeerControls } from "@shared/lib/rtc"

function fakePub(kind: string, track: Record<string, unknown> | null) {
    return {
        kind,
        track,
        isSubscribed: true,
        setSubscribed: vi.fn(),
    }
}

function fakeRoom(opts: { audio?: boolean; video?: boolean } = {}) {
    const list = [fakePub("audio", { kind: "audio", isMuted: false, setVolume: vi.fn() })]
    if (opts.video) list.push(fakePub("video", { kind: "video" }))
    const participant = {
        identity: "p1",
        trackPublications: new Map(list.map((pub, i) => [`pub-${i}`, pub])),
    }
    const publishData = vi.fn()
    const handlers: Array<(payload: Uint8Array) => void> = []
    const room = {
        remoteParticipants: new Map([["p1", participant]]),
        localParticipant: { identity: "operator", publishData },
        on: vi.fn((event: string, fn: (payload: Uint8Array) => void) => {
            if (event === "dataReceived") handlers.push(fn)
        }),
        off: vi.fn(),
    } as unknown as Room
    return { room, publishData, handlers }
}

function lastSent(publishData: ReturnType<typeof vi.fn>) {
    const call = publishData.mock.calls.at(-1)
    return JSON.parse(new TextDecoder().decode(call![0] as Uint8Array))
}

function report(handlers: Array<(payload: Uint8Array) => void>, body: object) {
    const payload = new TextEncoder().encode(JSON.stringify(body))
    for (const handler of handlers) handler(payload)
}

describe("peer controls contract — camera and deafen", () => {
    it("asks the player to turn the camera on when it is currently off", () => {
        const fake = fakeRoom({ audio: true })
        const { result } = renderHook(() => useRtcPeerControls(fake.room))

        act(() => result.current.get("p1")?.togglePlayerCam("p1"))

        expect(lastSent(fake.publishData)).toEqual({ type: "device_cam", targetId: "p1", on: true })
    })

    it("asks the player to turn the camera off once it reported being on", () => {
        const fake = fakeRoom({ audio: true, video: true })
        const { result } = renderHook(() => useRtcPeerControls(fake.room))

        act(() => report(fake.handlers, { type: "device_cam", sourceId: "p1", on: true }))
        expect(result.current.get("p1")?.isVideoHidden).toBe(false)

        act(() => result.current.get("p1")?.togglePlayerCam("p1"))

        expect(lastSent(fake.publishData)).toEqual({ type: "device_cam", targetId: "p1", on: false })
    })

    it("sends a deafen order to the player instead of muting locally", () => {
        const fake = fakeRoom({ audio: true })
        const { result } = renderHook(() => useRtcPeerControls(fake.room))

        act(() => result.current.get("p1")?.togglePlayerAudio("p1"))

        expect(lastSent(fake.publishData)).toEqual({ type: "device_audio", targetId: "p1", on: false })
    })

    it("reflects the player's own deafen report back on the card", () => {
        const fake = fakeRoom({ audio: true })
        const { result } = renderHook(() => useRtcPeerControls(fake.room))

        expect(result.current.get("p1")?.isAudioMuted).toBe(false)

        act(() => report(fake.handlers, { type: "device_audio", sourceId: "p1", on: false }))
        expect(result.current.get("p1")?.isAudioMuted).toBe(true)

        act(() => report(fake.handlers, { type: "device_audio", sourceId: "p1", on: true }))
        expect(result.current.get("p1")?.isAudioMuted).toBe(false)
    })

    it("reflects the player's mic from the live track state on the card", () => {
        const fake = fakeRoom({ audio: true })
        const { result } = renderHook(() => useRtcPeerControls(fake.room))

        expect(result.current.get("p1")?.isMicOn).toBe(true)

        act(() => result.current.get("p1")?.togglePlayerMic("p1"))

        expect(lastSent(fake.publishData)).toEqual({ type: "device_mic", targetId: "p1", on: false })
    })
})
