import { STRIP_R, pt } from "./geometry"

/**
 * The round's question counter: one small numbered tile per question.
 * Khởi động and Bứt phá share it, on the console and on the player deck.
 */
export type QuestionNumberState = "done" | "active" | "pending"

const NUMBER_TONE: Record<QuestionNumberState, string> = {
    done: "bg-primary text-primary-foreground",
    active: "bg-card text-foreground ring-2 ring-primary",
    pending: "bg-card text-muted-foreground ring-1 ring-border",
}

export function QuestionNumber({ index, state, onClick, current, tone }: {
    index: number
    state: QuestionNumberState
    onClick?: () => void
    current?: boolean
    tone?: string
}) {
    let label = String(index + 1)
    if (state === "done") label = `✓${index + 1}`
    const toneClass = tone ?? NUMBER_TONE[state]
    let cursor = ""
    if (onClick) cursor = "cursor-pointer transition hover:brightness-110"
    let ariaCurrent: "step" | undefined = undefined
    if (current) ariaCurrent = "step"
    const className = `flex h-[1.95cqw] min-w-[1.95cqw] items-center justify-center px-[0.3cqw] font-display font-bold leading-none ${toneClass} ${cursor}`
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

export function QuestionNumbers({ total, done, active, next, onAdvance }: {
    total: number
    done: number
    active: number | null
    next: number | null
    onAdvance?: (index: number) => void
}) {
    return (
        <div className="flex shrink-0 items-center gap-[0.98cqw]">
            {Array.from({ length: total }, (_, index) => {
                let state: QuestionNumberState = "pending"
                if (index < done) state = "done"
                else if (index === active) state = "active"

                let advance: (() => void) | undefined
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
                    />
                )
            })}
        </div>
    )
}
