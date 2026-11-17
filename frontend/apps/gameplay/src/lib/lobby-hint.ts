import { isKnownRound } from "@shared/deck/geometry"

export const NOT_LIVE_HINT = "Trận đấu sắp sửa diễn ra."

const UNKNOWN_ROUND_HINT = "Vòng thi không tồn tại."


export function lobbyHintOf(roundId: string, stage: string): string {
    if (!isKnownRound(roundId) || stage === "unknown") return UNKNOWN_ROUND_HINT
    return NOT_LIVE_HINT
}
