import { useEffect, useRef, useState } from "react"
import { pt } from "./geometry"

/**
 * A verdict lands on a card: a big delta and a ringed ✔/✖ take over the
 * right half for a beat, then hand the name and score back.
 */
export interface VerdictFlash {
    /** Points gained or lost. 0 still shows the mark (a re-grade to the same score). */
    delta: number
    /** Bumped per flash so an identical delta replays. */
    seq: number
}

const FLASH_MS = 1500

/**
 * Watches a score and reports every change. Works from the view alone, so it
 * survives reconnects and needs nothing from the server.
 */
export function useScoreFlash(points: number): VerdictFlash | null {
    const previous = useRef(points)
    const [flash, setFlash] = useState<VerdictFlash | null>(null)
    const seq = useRef(0)

    useEffect(() => {
        if (points === previous.current) return
        const delta = points - previous.current
        previous.current = points
        seq.current += 1
        setFlash({ delta, seq: seq.current })
        const timer = setTimeout(() => setFlash(null), FLASH_MS)
        return () => clearTimeout(timer)
    }, [points])

    return flash
}

function fmtDelta(delta: number): string {
    if (delta > 0) return `+${delta}`
    return `−${Math.abs(delta)}`
}

/**
 * The overlay itself. It is purely visual: `aria-live` announces the new score
 * for screen readers, and motion is suppressed for reduced-motion users.
 */
export function VerdictFlashLayer({ flash, points, size }: {
    flash: VerdictFlash | null
    points: number
    size?: number
}) {
    if (!flash) return null
    const correct = flash.delta > 0
    return (
        <div
            key={flash.seq}
            className="verdict-flash absolute inset-0 z-10 flex flex-col items-center justify-center gap-[0.2cqw] rounded-lg bg-background/80 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
            aria-label={`${correct ? "Đúng" : "Sai"}, ${fmtDelta(flash.delta)} điểm, tổng ${points}`}
        >
            <span className="verdict-flash-mark flex items-center justify-center rounded-full" style={{ fontSize: size ? pt(size * 0.7) : pt(24) }}>
                {correct ? "✔" : "✖"}
            </span>
            <span className="font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: size ? pt(size * 0.55) : pt(18) }}>
                {fmtDelta(flash.delta)}
            </span>
        </div>
    )
}
