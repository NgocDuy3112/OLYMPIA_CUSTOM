import type { RemoteVideoTrack } from "livekit-client"
import type { LobbyData } from "@/lib/live"
import { expandRoundEntries } from "../navigator-plan"

interface LobbyViewInput {
    lobby: LobbyData
    stagePhase: 1 | 2 | null
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
