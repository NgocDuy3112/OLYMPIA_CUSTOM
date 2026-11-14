import { useSocketStream } from "@shared/lib/ws"
import { playSfx } from "@shared/lib/sfx"

interface SfxFrame {
    type?: string
    data?: { name?: string; url?: string }
}

export function useAudienceSfx(tournamentId: string, matchId: string) {
    useSocketStream(
        `/spectate/tournaments/${tournamentId}/matches/${matchId}/live/stream`,
        Boolean(tournamentId && matchId),
        (message) => {
            const frame = message as SfxFrame | null
            if (!frame || typeof frame !== "object") return
            if (frame.type === "sfx" && frame.data?.url) playSfx(frame.data.url)
        }
    )
}
