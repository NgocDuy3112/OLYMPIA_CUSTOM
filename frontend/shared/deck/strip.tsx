import type { ReactNode } from "react"
import { DECK_PAD, STRIP_R, pt } from "./geometry"


export type StripItem = { label: string; content?: ReactNode; onClick?: () => void; title?: string; muted?: boolean; empty?: boolean }

const STRIP_BTN =
    "flex h-[2.6cqw] w-[7.6cqw] shrink-0 items-center justify-center px-[0.4cqw] text-center font-sans text-[inherit] font-semibold uppercase leading-tight tracking-wide shadow-sm"

const stripSlotClass = (pressable: boolean, muted = false): string => {
    if (pressable) return `${STRIP_BTN} cursor-pointer bg-primary text-primary-foreground transition hover:brightness-110`
    let tail = "tabular-nums"
    if (muted) tail = ""
    return `${STRIP_BTN} cursor-default bg-muted text-muted-foreground ring-1 ring-border ${tail}`
}

export function Strip({ items }: { items: StripItem[] }) {
    const visible = items.filter((item) => !item.empty)
    const rows: StripItem[][] = []
    for (let index = 0; index < visible.length; index += 8) {
        rows.push(visible.slice(index, index + 8))
    }
    return (
        <div className="flex shrink-0 flex-col items-start gap-[1cqw]">
            {rows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex items-center gap-[1cqw]">
                    {row.map((item) => {
                        if (item.onClick) {
                            return (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={item.onClick}
                                    title={item.title}
                                    className={`${stripSlotClass(true)}${item.muted ? "" : " console-ready"}`}
                                    style={{ fontSize: pt(9), borderRadius: STRIP_R }}
                                >
                                    {item.content ?? item.label}
                                </button>
                            )
                        }
                        return (
                            <span
                                key={item.label}
                                title={item.title}
                                className={stripSlotClass(false, item.muted)}
                                style={{ fontSize: pt(9), borderRadius: STRIP_R }}
                            >
                                {item.content ?? item.label}
                            </span>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}

export function VeDichStripCells({ cells }: {
    cells: Array<{ questionId: string; value: number; where: string }>
}) {
    return (
        <>
            {cells.map((c) => {
                let cellTone = "bg-muted ring-border"
                if (c.where === "open") cellTone = "bg-primary text-primary-foreground ring-primary"
                return (
                    <span
                        key={c.questionId}
                        className={`flex h-[4.43cqw] min-w-0 max-w-[10cqw] flex-1 flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${cellTone}`}
                        style={DECK_PAD}
                    >
                        <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{c.value}</b>
                    </span>
                )
            })}
        </>
    )
}


export function Chip({ value, tone = "gray", clickable, onClick, title }: {
    value: string | number | null
    tone?: "purple" | "gray"
    clickable?: boolean
    onClick?: () => void
    title?: string
}) {
    const toneClass = tone === "purple"
        ? "bg-primary text-primary-foreground ring-primary"
        : "bg-muted text-foreground ring-border"
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!clickable}
            title={title}
            className={`flex h-[4.43cqw] min-w-0 flex-1 max-w-[10cqw] items-center justify-center rounded-lg shadow-sm ring-1 font-display leading-none ${toneClass} ${clickable ? "cursor-pointer transition hover:brightness-95" : "cursor-default"}`}
            style={{ ...DECK_PAD, fontSize: pt(28) }}
        >
            {value ?? ""}
        </button>
    )
}

export function QuestionChips({ chips, onSelect }: {
    chips: Array<{ id: string; label: string; active: boolean; clickable?: boolean; title?: string }>
    onSelect?: (id: string) => void
}) {
    return (
        <span className="flex min-w-0 flex-1 items-center gap-[1.2cqw]">
            {chips.map((chip) => {
                let click: (() => void) | undefined = undefined
                if (chip.clickable && onSelect) click = () => onSelect(chip.id)
                return (
                    <Chip
                        key={chip.id}
                        value={chip.label}
                        tone={chip.active ? "purple" : "gray"}
                        clickable={Boolean(click)}
                        onClick={click}
                        title={chip.title}
                    />
                )
            })}
        </span>
    )
}
