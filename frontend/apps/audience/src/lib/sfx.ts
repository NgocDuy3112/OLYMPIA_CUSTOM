import { useSocketStream } from "@shared/lib/ws"
import { playSfx, stopSfx } from "@shared/lib/sfx"

interface SfxFrame {
    type?: string
    data?: { name?: string; url?: string; stop?: boolean }
}

export function useAudienceSfx(tournamentId: string, matchId: string) {
    useSocketStream(
        `/spectate/tournaments/${tournamentId}/matches/${matchId}/live/stream`,
        Boolean(tournamentId && matchId),
        (message) => {
            const frame = message as SfxFrame | null
            if (!frame || typeof frame !== "object") return
            if (frame.type === "sfx") {
                if (frame.data?.stop === true) stopSfx()
                else if (frame.data?.url) playSfx(frame.data.url)
            }
        }
    )
}
