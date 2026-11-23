import { STRIP_R, pt } from "./geometry"

export type QuestionNumberState = "done" | "active" | "pending"

const NUMBER_TONE: Record<QuestionNumberState, string> = {
    done: "bg-primary/85 text-primary-foreground",
    active: "bg-primary text-primary-foreground ring-2 ring-primary-foreground/70",
    pending: "bg-transparent text-muted-foreground ring-1 ring-border",
}

export function QuestionNumber({ index, state, onClick, current, tone, showDone }: {
    index: number
    state: QuestionNumberState
    onClick?: () => void
    current?: boolean
    tone?: string
    showDone?: boolean
}) {
    let label = String(index + 1)
    if (state === "done" && showDone !== false) label = "✓" + (index + 1)
    const toneClass = tone ?? NUMBER_TONE[state]
    let cursor = ""
    if (onClick) cursor = "cursor-pointer transition hover:brightness-110"
    let ariaCurrent: "step" | undefined = undefined
    if (current) ariaCurrent = "step"
    const className = "flex h-[1.95cqw] min-w-[1.95cqw] items-center justify-center px-[0.3cqw] font-display font-bold leading-none " + toneClass + " " + cursor
    const style = { fontSize: pt(12), borderRadius: STRIP_R }

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                aria-current={ariaCurrent}
                className={className}
                style={style}
            >
                {label}
            </button>
        )
    }
    return (
        <span aria-current={ariaCurrent} className={className} style={style}>
            {label}
        </span>
    )
}

export function QuestionNumbers({ total, done, active, next, onAdvance, showDone }: {
    total: number
    done: number
    active: number | null
    next: number | null
    onAdvance?: (index: number) => void
    showDone?: boolean
}) {
    return (
        <div className="flex shrink-0 items-center gap-[0.98cqw]">
            {Array.from({ length: total }, (_, index) => {
                let state: QuestionNumberState = "pending"
                if (index < done) state = "done"
                else if (index === active) state = "active"

                let advance: (() => void) | undefined = undefined
                let tone: string | undefined = undefined
                if (onAdvance !== undefined && index === next) {
                    advance = () => onAdvance(index)
                    if (state === "pending") tone = "bg-card text-foreground ring-1 ring-primary"
                }
                return (
                    <QuestionNumber
                        key={index}
                        index={index}
                        state={state}
                        onClick={advance}
                        current={state === "active"}
                        tone={tone}
                        showDone={showDone}
                    />
                )
            })}
        </div>
    )
}
