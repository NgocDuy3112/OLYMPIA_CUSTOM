import { isKnownRound } from "@shared/deck/geometry"

export const NOT_LIVE_HINT = "Trận đấu sắp sửa diễn ra."

const UNKNOWN_ROUND_HINT = "Vòng thi không tồn tại."
const ENDED_HINT = "Trận đấu đã kết thúc."
const WAITING_HINT = "Trận đấu sẽ tiếp tục sau một ít thời gian"


export function lobbyHintOf(roundId: string, stage: string): string {
    if (!isKnownRound(roundId) || stage === "unknown") return UNKNOWN_ROUND_HINT
    if (stage === "ended") return ENDED_HINT
    return WAITING_HINT
}