import { STRIP_R, pt } from "./geometry"

type ChipState = "done" | "active" | "pending"

const CHIP_TONE: Record<ChipState, string> = {
    done: "bg-primary text-primary-foreground",
    active: "bg-card text-foreground ring-2 ring-primary",
    pending: "bg-card text-muted-foreground ring-1 ring-border",
}

function stateOf(index: number, done: number, active: number | null): ChipState {
    if (index < done) return "done"
    if (index === active) return "active"
    return "pending"
}

export function QuestionStepper({ total, done, active, next, onAdvance }: {
    total: number
    done: number
    active: number | null
    next: number | null
    onAdvance?: (index: number) => void
}) {
    return (
        <div className="flex shrink-0 items-center gap-[0.98cqw]">
            {Array.from({ length: total }, (_, index) => {
                const state = stateOf(index, done, active)
                const handler = onAdvance
                let advance: (() => void) | undefined
                let tone = CHIP_TONE[state]
                if (handler !== undefined) {
                    if (index === next) {
                        advance = () => handler(index)
                        if (state === "pending") tone = "bg-card text-foreground ring-1 ring-primary"
                    }
                }
                let label = String(index + 1)
                if (state === "done") label = `✓${index + 1}`
                let cursor = ""
                if (advance) cursor = "cursor-pointer transition hover:brightness-110"
                let current: "step" | undefined
                if (state === "active") current = "step"
                const className = `flex h-[1.95cqw] min-w-[1.95cqw] items-center justify-center px-[0.3cqw] font-display font-bold leading-none ${tone} ${cursor}`
                const style = { fontSize: pt(12), borderRadius: STRIP_R }
                if (advance) {
                    return (
                        <button
                            key={index}
                            type="button"
                            onClick={advance}
                            aria-current={current}
                            className={className}
                            style={style}
                        >
                            {label}
                        </button>
                    )
                }
                return (
                    <span key={index} aria-current={current} className={className} style={style}>
                        {label}
                    </span>
                )
            })}
        </div>
    )
}
