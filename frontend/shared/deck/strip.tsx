import type { ReactNode } from "react"
import { DECK_PAD, STRIP_R, pt } from "./geometry"


export type StripItem = { label: string; content?: ReactNode; onClick?: () => void; title?: string; muted?: boolean; empty?: boolean }

const STRIP_BTN =
    "flex h-[3.3cqw] w-[9.08cqw] shrink-0 items-center justify-center px-[0.5cqw] text-center font-sans text-[inherit] font-semibold uppercase leading-tight tracking-wide shadow-sm"

const stripSlotClass = (pressable: boolean, muted = false): string => {
    if (pressable) return `${STRIP_BTN} cursor-pointer bg-primary text-primary-foreground transition hover:brightness-110`
    let tail = "tabular-nums"
    if (muted) tail = ""
    return `${STRIP_BTN} cursor-default bg-muted text-muted-foreground ring-1 ring-border ${tail}`
}

export function Strip({ items }: { items: StripItem[] }) {
    return (
        <div className="flex shrink-0 flex-wrap items-center gap-[1cqw]">
            {items.map((item) => {
                if (item.empty) return null
                if (item.onClick) {
                    return (
                        <button
                            key={item.label}
                            type="button"
                            onClick={item.onClick}
                            title={item.title}
                            className={stripSlotClass(true)}
                            style={{ fontSize: pt(11), borderRadius: STRIP_R }}
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
                        style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                    >
                        {item.content ?? item.label}
                    </span>
                )
            })}
        </div>
    )
}

export function VeDichStripCells({ cells, phase2 }: {
    cells: Array<{ questionId: string; value: number; where: string }>
    phase2: boolean
}) {
    let cellCount = 4
    if (phase2) cellCount = 3
    return (
        <>
            {cells.slice(0, cellCount).map((c) => {
                let cellTone = "bg-muted ring-border"
                if (c.where === "open") cellTone = "bg-primary text-primary-foreground ring-primary"
                return (
                    <span
                        key={c.questionId}
                        className={`flex h-[4.43cqw] w-[10cqw] shrink-0 flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${cellTone}`}
                        style={DECK_PAD}
                    >
                        <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{c.value}</b>
                    </span>
                )
            })}
        </>
    )
}
