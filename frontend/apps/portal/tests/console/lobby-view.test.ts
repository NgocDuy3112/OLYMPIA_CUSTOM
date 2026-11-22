import { describe, expect, it, vi } from "vitest"
import { lobbyViewOf } from "@/console/lib/lobby-view"
import type { LobbyData } from "@/lib/live"
import type { PeerControls } from "@shared/lib/rtc"

const LOBBY: LobbyData = {
    title: "Chung kết",
    label: "Vòng 1",
    status: "LIVE",
    roundId: "khoi-dong",
    rounds: [],
    table: [
        { id: "u1", displayName: "An", points: 10, rank: 1 },
        { id: "u2", displayName: "Bình", points: 20, rank: 2 },
    ],
    connected: [],
}

function controls(over: Partial<PeerControls> = {}) {
    const togglePlayerAudio = vi.fn()
    const togglePlayerVideo = vi.fn()
    const togglePlayerMic = vi.fn()
    return {
        value: {
            isMicOn: true,
            isAudioMuted: false,
            isVideoHidden: false,
            togglePlayerAudio,
            togglePlayerVideo,
            togglePlayerMic,
            togglePlayerCam: vi.fn(),
            ...over,
        } as PeerControls,
        togglePlayerAudio,
        togglePlayerVideo,
        togglePlayerMic,
    }
}

describe("lobbyViewOf — player card controls", () => {
    it("carries mic, audio and video state onto the matching seat", () => {
        const an = controls({ isMicOn: false, isAudioMuted: true, isVideoHidden: true })
        const view = lobbyViewOf({
            lobby: LOBBY,
            stagePhase: null,
            videoOf: () => null,
            peerControls: new Map([["u1", an.value]]),
        })

        const seat = view.table.find((row) => row.id === "u1")
        expect(seat?.micOn).toBe(false)
        expect(seat?.audioMuted).toBe(true)
        expect(seat?.videoHidden).toBe(true)
    })

    it("routes each toggle to the seat it belongs to", () => {
        const an = controls()
        const view = lobbyViewOf({
            lobby: LOBBY,
            stagePhase: null,
            videoOf: () => null,
            peerControls: new Map([["u1", an.value]]),
        })

        const seat = view.table.find((row) => row.id === "u1")!
        seat.onToggleMic?.()
        seat.onToggleAudio?.()
        seat.onToggleVideo?.()
        expect(an.togglePlayerMic).toHaveBeenCalledWith("u1")
        expect(an.togglePlayerAudio).toHaveBeenCalledWith("u1")
        expect(an.togglePlayerVideo).toHaveBeenCalledWith("u1")
    })

    it("leaves a seat bare when no peer is connected so the widget stays hidden", () => {
        const view = lobbyViewOf({
            lobby: LOBBY,
            stagePhase: null,
            videoOf: () => null,
            peerControls: new Map(),
        })

        const seat = view.table.find((row) => row.id === "u1")
        expect(seat?.onToggleMic).toBeUndefined()
        expect(seat?.onToggleAudio).toBeUndefined()
        expect(seat?.onToggleVideo).toBeUndefined()
    })
})
