import type { RemoteVideoTrack } from "livekit-client"
import { expandRoundEntries } from "@/console/navigator-plan"
import type { LobbyData } from "@/lib/live"
import type { RtcPeerControlsMap } from "@shared/lib/rtc"

interface LobbyViewInput {
    lobby: LobbyData
    stagePhase: 1 | 2 | null
    videoOf: (id: string) => RemoteVideoTrack | null
    peerControls: RtcPeerControlsMap
}

export function lobbyViewOf(input: LobbyViewInput): LobbyData {
    return {
        ...input.lobby,
        currentPhase: input.stagePhase,
        rounds: expandRoundEntries(input.lobby.rounds),
        table: input.lobby.table.map((seat) => {
            const controls = input.peerControls.get(seat.id)
            const row = { ...seat, video: input.videoOf(seat.id) }
            if (!controls) return row
            return {
                ...row,
                micOn: controls.isMicOn,
                audioMuted: controls.isAudioMuted,
                videoHidden: controls.isVideoHidden,
                onToggleMic: () => controls.togglePlayerMic(seat.id),
                onToggleAudio: () => controls.togglePlayerAudio(seat.id),
                onToggleVideo: () => controls.togglePlayerVideo(seat.id),
            }
        }),
    }
}
