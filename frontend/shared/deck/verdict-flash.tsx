import { Check, X } from "lucide-react"
import { TYPE, pt } from "./geometry"
import { fmtDelta, type VerdictFlash } from "./score-flash"

function VerdictRing() {
    return (
        <svg className="verdict-flash-ring" viewBox="0 0 52 52" aria-hidden>
            <circle className="verdict-flash-ring-draw" cx="26" cy="26" r="24" />
        </svg>
    )
}

function VerdictMark({ correct, size }: { correct: boolean; size: number }) {
    const Icon = correct ? Check : X
    return (
        <span className="verdict-flash-mark" style={{ width: pt(size), height: pt(size) }}>
            <VerdictRing />
            <Icon className="verdict-flash-icon" strokeWidth={3} aria-hidden />
        </span>
    )
}

export function VerdictFlashLayer({ flash, points, size }: {
    flash: VerdictFlash | null
    points: number
    size?: number
}) {
    if (!flash) return null
    const correct = flash.delta > 0
    const markSize = size ? size * 0.85 : TYPE.mark
    let tone = "verdict-flash-bad"
    if (correct) tone = "verdict-flash-good"
    return (
        <span
            key={flash.seq}
            className={"verdict-flash " + tone + " absolute inset-0 z-10 flex flex-col items-center justify-center gap-[0.4cqw]"}
            role="status"
            aria-live="polite"
            aria-label={(correct ? "Đúng" : "Sai") + ", " + fmtDelta(flash.delta) + " điểm, tổng " + points}
        >
            <VerdictMark correct={correct} size={markSize} />
            <span className="verdict-flash-delta font-display font-bold leading-none tabular-nums" style={{ fontSize: size ? pt(size * 0.6) : pt(TYPE.value) }}>
                {fmtDelta(flash.delta)}
            </span>
        </span>
    )
}
