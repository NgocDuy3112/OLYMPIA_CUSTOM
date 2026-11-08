type RailCardState = "waiting" | "correct" | "wrong" | "buzzing"

const STATE: Record<RailCardState, string> = {
    correct: "bg-emerald-50 ring-2 ring-emerald-500",
    wrong: "bg-muted text-muted-foreground ring-1 ring-border opacity-70",
    buzzing: "bg-primary text-primary-foreground outline-2 outline-dashed outline-white",
    waiting: "bg-primary/10 ring-1 ring-primary/40",
}

const SCORE: Record<RailCardState, string> = {
    correct: "text-emerald-600",
    wrong: "text-muted-foreground",
    buzzing: "text-primary-foreground",
    waiting: "text-foreground",
}

export function railCardState(input: {
    verdict?: "CORRECT" | "INCORRECT" | null
    locked?: boolean
    buzzing?: boolean
}): RailCardState {
    if (input.verdict === "CORRECT") return "correct"
    if (input.verdict === "INCORRECT" || input.locked) return "wrong"
    if (input.buzzing) return "buzzing"
    return "waiting"
}

export function railCardClass(state: RailCardState): string {
    return `transition ${STATE[state]}`
}

export function railScoreClass(state: RailCardState): string {
    return SCORE[state]
}
