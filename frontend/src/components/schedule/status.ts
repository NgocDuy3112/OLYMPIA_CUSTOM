import type { MatchStatus } from "@/data/schedule"

export const STATUS_VARIANT: Record<MatchStatus, "outline" | "destructive" | "secondary"> = {
    UPCOMING: "outline",
    LIVE: "destructive",
    FINISHED: "secondary",
}

export const STATUS_LABEL: Record<MatchStatus, string> = {
    UPCOMING: "Upcoming",
    LIVE: "Live",
    FINISHED: "Finished",
}