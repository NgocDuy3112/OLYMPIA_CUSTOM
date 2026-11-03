// The waiting room, ready to draw.
//
// The lobby payload is shared by every host (console, player deck, audience) and
// knows nothing about phases or cameras. This is the console's view of it:
// the paired rounds expanded into their "· Chung / · Riêng" entries, the current
// phase marked, and each seat carrying its live camera.
//
// Pure — same payload + same cameras, same view. The cameras are passed as a
// lookup so this file never touches the Room.
import type { RemoteVideoTrack } from "livekit-client"
import type { LobbyData } from "@/lib/live"
import { expandRoundEntries } from "../navigator-plan"

interface LobbyViewInput {
    lobby: LobbyData
    /** which phase this surface is standing in (null before any round) */
    stagePhase: 1 | 2 | null
    /** the seat's live camera, by user id */
    videoOf: (id: string) => RemoteVideoTrack | null
}

export function lobbyViewOf(input: LobbyViewInput): LobbyData {
    return {
        ...input.lobby,
        currentPhase: input.stagePhase,
        rounds: expandRoundEntries(input.lobby.rounds),
        table: input.lobby.table.map((seat) => ({ ...seat, video: input.videoOf(seat.id) })),
    }
}
