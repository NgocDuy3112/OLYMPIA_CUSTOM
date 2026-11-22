import { act, renderHook } from "@testing-library/react"
import type { Room } from "livekit-client"
import { describe, expect, it, vi } from "vitest"
import { useHostBroadcast } from "@shared/lib/rtc"


interface FakeRoom {
    room: Room
    setCameraEnabled: ReturnType<typeof vi.fn>
    setMicrophoneEnabled: ReturnType<typeof vi.fn>
}

function fakeRoom(over: { camRejects?: boolean } = {}): FakeRoom {
    const setCameraEnabled = vi.fn(async (on: boolean) => {
        if (over.camRejects && on) {
            throw new DOMException("denied", "NotAllowedError")
        }
        return { track: on ? { kind: "video" } : undefined }
    })
    const setMicrophoneEnabled = vi.fn(async () => undefined)
    const room = {
        localParticipant: { setCameraEnabled, setMicrophoneEnabled },
        remoteParticipants: new Map(),
        on: vi.fn(),
        off: vi.fn(),
    } as unknown as Room
    return { room, setCameraEnabled, setMicrophoneEnabled }
}



function fakeRoomWithAudio() {
    const setVolume = vi.fn()
    const delivery: { isSubscribed: boolean } = { isSubscribed: true }
    const setSubscribed = vi.fn((value: boolean) => {
        delivery.isSubscribed = value
    })
    const publication = {
        kind: "audio",
        get isSubscribed() {
            return delivery.isSubscribed
        },
        setSubscribed,
        track: { setVolume },
    }
    const participant = { identity: "peer-1", trackPublications: new Map([[ "pub-1", publication ]]) }
    const room = {
        localParticipant: { setCameraEnabled: vi.fn(), setMicrophoneEnabled: vi.fn() },
        remoteParticipants: new Map([[participant.identity, participant]]),
        on: vi.fn(),
        off: vi.fn(),
    } as unknown as Room
    return { room, setSubscribed, setVolume }
}

describe("useHostBroadcast", () => {
    it("is inert without a room — toggles neither publish nor throw", () => {
        const { result } = renderHook(() => useHostBroadcast(null))

        expect(result.current.connected).toBe(false)
        expect(result.current.camOn).toBe(false)
        expect(result.current.micOn).toBe(false)

        act(() => result.current.toggleCam())
        act(() => result.current.toggleMic())
        expect(result.current.camOn).toBe(false)
        expect(result.current.micOn).toBe(false)
    })

    it("publishes cam and mic on the given room only when toggled", async () => {
        const fake = fakeRoom()
        const { result } = renderHook(() => useHostBroadcast(fake.room))

        expect(result.current.connected).toBe(true)

        await act(async () => result.current.toggleCam())
        expect(fake.setCameraEnabled).toHaveBeenCalledWith(true)
        expect(result.current.camOn).toBe(true)
        expect(result.current.video).toBeTruthy()

        await act(async () => result.current.toggleMic())
        expect(fake.setMicrophoneEnabled).toHaveBeenCalledWith(true)
        expect(result.current.micOn).toBe(true)

        await act(async () => result.current.toggleCam())
        expect(fake.setCameraEnabled).toHaveBeenCalledWith(false)
        expect(result.current.camOn).toBe(false)
        expect(result.current.video).toBeNull()
    })

    it("surfaces a permission refusal as mediaError instead of crashing", async () => {
        const fake = fakeRoom({ camRejects: true })
        const { result } = renderHook(() => useHostBroadcast(fake.room))

        await act(async () => result.current.toggleCam())

        expect(result.current.mediaError).toContain("Trình duyệt chặn quyền camera/mic")
        expect(result.current.camOn).toBe(false)
    })

    it("falls back to off when the room drops (reconnect hands back a new participant)", async () => {
        const fake = fakeRoom()
        const { result, rerender } = renderHook(
            ({ room }: { room: Room | null }) => useHostBroadcast(room),
            { initialProps: { room: fake.room as Room | null } }
        )

        await act(async () => result.current.toggleCam())
        expect(result.current.camOn).toBe(true)

        rerender({ room: null })
        expect(result.current.connected).toBe(false)
        expect(result.current.camOn).toBe(false)
        expect(result.current.video).toBeNull()
    })

    it("starts with deafen off", () => {
        const { result } = renderHook(() => useHostBroadcast(null))
        expect(result.current.deafen).toBe(false)
    })

    it("toggleDeafen flips the deafen flag", () => {
        const { result } = renderHook(() => useHostBroadcast(null))

        act(() => result.current.toggleDeafen())
        expect(result.current.deafen).toBe(true)

        act(() => result.current.toggleDeafen())
        expect(result.current.deafen).toBe(false)
    })

    it("deafen silences remote audio and undeafen restores it", () => {
        const fake = fakeRoomWithAudio()
        const { result } = renderHook(() => useHostBroadcast(fake.room))

        expect(fake.setVolume).toHaveBeenLastCalledWith(1)

        act(() => result.current.toggleDeafen())
        expect(result.current.deafen).toBe(true)
        expect(fake.setVolume).toHaveBeenLastCalledWith(0)
        expect(fake.setSubscribed).toHaveBeenLastCalledWith(false)

        act(() => result.current.toggleDeafen())
        expect(result.current.deafen).toBe(false)
        expect(fake.setVolume).toHaveBeenLastCalledWith(1)
        expect(fake.setSubscribed).toHaveBeenLastCalledWith(true)
    })

    it("deafen leaves local cam and mic state alone", async () => {
        const fake = fakeRoom()
        const { result } = renderHook(() => useHostBroadcast(fake.room))

        await act(async () => result.current.toggleMic())
        act(() => result.current.toggleDeafen())

        expect(result.current.micOn).toBe(true)
        expect(fake.setMicrophoneEnabled).toHaveBeenCalledTimes(1)
    })
})
