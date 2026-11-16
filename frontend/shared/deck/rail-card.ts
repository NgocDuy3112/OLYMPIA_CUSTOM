type RailCardState = "waiting" | "wrong" | "buzzing"

const STATE: Record<RailCardState, string> = {
    wrong: "bg-muted text-muted-foreground ring-1 ring-border opacity-70",
    buzzing: "bg-primary text-primary-foreground outline-2 outline-dashed outline-white",
    waiting: "bg-primary/10 ring-1 ring-border",
}

const SCORE: Record<RailCardState, string> = {
    wrong: "text-muted-foreground",
    buzzing: "text-primary-foreground",
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
