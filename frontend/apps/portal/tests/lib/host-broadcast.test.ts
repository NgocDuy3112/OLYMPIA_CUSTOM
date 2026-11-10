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
    } as unknown as Room
    return { room, setCameraEnabled, setMicrophoneEnabled }
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
})
