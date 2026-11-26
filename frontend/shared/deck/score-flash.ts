import { useEffect, useRef, useState } from "react"

export interface VerdictFlash {
    delta: number
    seq: number
}

const FLASH_MS = 2000

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

export function fmtDelta(delta: number): string {
    if (delta > 0) return "+" + delta
    return "−" + Math.abs(delta)
}
