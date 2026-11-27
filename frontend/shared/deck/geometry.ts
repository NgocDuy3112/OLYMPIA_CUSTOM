import { type CSSProperties } from "react"


const CANVAS_W = 13.3333
const PT_SCALE = 0.75
export const pt = (v: number) => `calc(${+(((v * PT_SCALE) / 72 / CANVAS_W) * 100).toFixed(3)}cqw * var(--deck-type-scale))`
export const STRIP_R = `${+(((0.44 * 0.31623) / CANVAS_W) * 100).toFixed(3)}cqw`

export const TYPE = {
    micro: 9,
    meta: 10,
    label: 11,
    bodySm: 12,
    body: 13,
    question: 15,
    title: 16,
    value: 20,
    digit: 28,
    mark: 30,
    badge: 32,
    timerSm: 32,
    score: 34,
    timer: 40,
    hero: 48,
} as const

export const CONTROL_H = "h-[3.3cqw]"
export const CONTROL_W = "w-[9.08cqw]"
export const CHIP_H = "h-[4.43cqw]"
export const CHIP_W = "w-[7cqw]"
export const STEP_H = "h-[1.95cqw]"
export const STEP_MIN_W = "min-w-[1.95cqw]"
export const RAIL_CARD_H = "h-[9.3cqw]"
export const STRIP_H = "h-[2.6cqw]"
export const STRIP_W = "w-[7.6cqw]"
export const DECK_PAD: CSSProperties = {
    paddingLeft: "0.75cqw",
    paddingRight: "0.75cqw",
    paddingTop: "0.375cqw",
    paddingBottom: "0.375cqw",
}

export const ROUND_LABEL: Record<string, string> = {
    "khoi-dong": "Khởi động",
    "giai-ma": "Giải mã",
    "but-pha": "Bứt phá",
    "ve-dich": "Về đích",
}

export const isKnownRound = (roundId: string): boolean => roundId in ROUND_LABEL

const WAITING_STAGES = new Set(["pending", "ended", "unknown", "lobby"])
export const isWaitingStage = (stage: string): boolean => WAITING_STAGES.has(stage)

export const toClock = (text: string): string => {
    let seconds = text.split(":").reduce((total, part) => total * 60 + Number(part), 0)
    if (/^\d+$/.test(text)) seconds = Number(text)
    if (Number.isNaN(seconds)) return text
    return String(seconds).padStart(2, "0")
}

export const initialsOf = (name: string): string =>
    name.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"
