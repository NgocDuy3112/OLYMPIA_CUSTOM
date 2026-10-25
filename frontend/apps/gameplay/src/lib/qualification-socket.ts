import { useSocketStream } from "./ws"

// The mass event's turn channel: the staff's open/advance/close arrives as a
// push, and the player refetches ONLY in response (push-first — never a poll).
// All the socket mechanics (dial, backoff, stop codes) live in ./ws.
export function useQualificationStream(
    matchId: string,
    enabled: boolean,
    onSignal: () => void
) {
    useSocketStream(
        enabled && matchId ? `/gameplay/matches/${matchId}/qualification/stream` : null,
        true,
        (message) => {
            const frame = message as { type?: string } | null
            if (frame && (frame.type === "sync" || frame.type === "refresh")) {
                onSignal()
            }
        }
    )
}
