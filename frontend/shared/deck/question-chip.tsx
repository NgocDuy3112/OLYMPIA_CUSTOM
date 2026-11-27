import { CHIP_H, CHIP_W, DECK_PAD, TYPE, pt } from "./geometry"

/**
 * The Về đích question chip: a rectangle showing a question's value.
 * Shared by the console and the player deck so both stay identical.
 */
export function QuestionChip({ value, tone = "gray", clickable, onClick, title, fixedWidth, live }: {
    value: string | number | null
    tone?: "purple" | "gray"
    clickable?: boolean
    onClick?: () => void
    title?: string
    fixedWidth?: boolean
    /** The question is on stage right now — it breathes in the round's colour. */
    live?: boolean
}) {
    const toneClass = tone === "purple"
        ? "bg-primary text-primary-foreground ring-2 ring-(--warning)"
        : "bg-muted text-foreground ring-1 ring-border"
    const width = fixedWidth ? CHIP_W : "min-w-[7cqw] shrink-0"
    let pulse = ""
    if (live) pulse = " stage-pulse"
    return (
        <button
            type="button"
            onClick={clickable ? onClick : undefined}
            aria-disabled={clickable ? undefined : true}
            title={title}
            className={`flex ${CHIP_H} ${width} items-center justify-center rounded-lg px-[1.4cqw] shadow-sm font-display leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${toneClass} ${clickable ? "cursor-pointer transition hover:brightness-95" : "cursor-default"}${pulse}`}
            style={DECK_PAD}
        >
            <span style={{ fontSize: pt(TYPE.score) }}>{value ?? ""}</span>
        </button>
    )
}

export function QuestionChips({ chips, onSelect }: {
    chips: Array<{ id: string; label: string; active: boolean; live?: boolean; clickable?: boolean; title?: string }>
    onSelect?: (id: string) => void
}) {
    return (
        <span className="flex min-w-0 flex-1 items-center gap-[1.2cqw]">
            {chips.map((chip) => {
                let click: (() => void) | undefined = undefined
                if (chip.clickable && onSelect) click = () => onSelect(chip.id)
                const canClick = Boolean(click)
                return (
                    <QuestionChip
                        key={chip.id}
                        value={chip.label}
                        tone={chip.active ? "purple" : "gray"}
                        clickable={canClick}
                        onClick={click}
                        title={chip.title}
                        fixedWidth
                        live={chip.live ?? chip.active}
                    />
                )
            })}
        </span>
    )
}
