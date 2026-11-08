import { type CSSProperties } from "react"


const CANVAS_W = 13.3333
const PT_SCALE = 0.75
export const pt = (v: number) => `${+(((v * PT_SCALE) / 72 / CANVAS_W) * 100).toFixed(3)}cqw`
export const STRIP_R = `${+(((0.44 * 0.31623) / CANVAS_W) * 100).toFixed(3)}cqw`
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

const WAITING_STAGES = new Set(["pending", "ended", "unknown"])
export const isWaitingStage = (stage: string): boolean => WAITING_STAGES.has(stage)

export const toClock = (text: string): string => {
    const seconds = /^\d+$/.test(text)
        ? Number(text)
        : text.split(":").reduce((total, part) => total * 60 + Number(part), 0)
    if (Number.isNaN(seconds)) return text
    return String(seconds).padStart(2, "0")
}
