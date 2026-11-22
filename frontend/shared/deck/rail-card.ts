type RailCardState = "waiting" | "wrong" | "buzzing" | "picked" | "submitted"

const STATE: Record<RailCardState, string> = {
    wrong: "bg-[#101116] text-muted-foreground ring-1 ring-white/10",
    buzzing: "bg-[#3a4150] text-white ring-4 ring-white shadow-[0_0_0_6px] shadow-white/40",
    picked: "bg-[#3a4150] text-white ring-4 ring-white shadow-[0_0_0_6px] shadow-white/40",
    submitted: "bg-[#3a4150] text-white ring-4 ring-white shadow-[0_0_0_6px] shadow-white/40",
    waiting: "bg-[#16181e] ring-1 ring-white/10",
}

const SCORE: Record<RailCardState, string> = {
    wrong: "text-muted-foreground",
    buzzing: "text-white",
    picked: "text-white",
    submitted: "text-white",
    waiting: "text-foreground",
}

export function railCardState(input: {
    locked?: boolean
    buzzing?: boolean
    picked?: boolean
    submitted?: boolean
}): RailCardState {
    if (input.locked) return "wrong"
    if (input.buzzing) return "buzzing"
    if (input.picked) return "picked"
    if (input.submitted) return "submitted"
    return "waiting"
}

export function railCardClass(state: RailCardState): string {
    return `transition ${STATE[state]}`
}

export function railScoreClass(state: RailCardState): string {
    return SCORE[state]
}
