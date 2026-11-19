type RailCardState = "waiting" | "wrong" | "buzzing"

const STATE: Record<RailCardState, string> = {
    wrong: "bg-[#101116] text-muted-foreground ring-1 ring-white/10",
    buzzing: "bg-[#2a2f38] text-foreground ring-1 ring-white/40 outline-2 outline-dashed outline-white",
    waiting: "bg-[#16181e] ring-1 ring-white/10",
}

const SCORE: Record<RailCardState, string> = {
    wrong: "text-muted-foreground",
    buzzing: "text-white",
    waiting: "text-foreground",
}

export function railCardState(input: {
    locked?: boolean
    buzzing?: boolean
}): RailCardState {
    if (input.locked) return "wrong"
    if (input.buzzing) return "buzzing"
    return "waiting"
}

export function railCardClass(state: RailCardState): string {
    return `transition ${STATE[state]}`
}

export function railScoreClass(state: RailCardState): string {
    return SCORE[state]
}
