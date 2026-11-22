import type { ReactNode } from "react"
import { STRIP_R, pt } from "./geometry"


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


// The Về đích question chips live in their own module so the console and the
// player deck can import the same component.
export { QuestionChip as Chip, QuestionChips } from "./question-chip"
