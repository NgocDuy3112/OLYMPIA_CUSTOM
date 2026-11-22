import { useEffect } from "react"
import { isKnownRound, isWaitingStage } from "@shared/deck/geometry"

export type GlowKey = "white" | "lobby" | "khoi-dong" | "giai-ma" | "but-pha" | "ve-dich" | "ve-dich-rieng"

const ROUND_GLOW: Record<string, GlowKey> = {
    "khoi-dong": "khoi-dong",
    "giai-ma": "giai-ma",
    "but-pha": "but-pha",
    "ve-dich": "ve-dich",
}

export function roundGlowOf(roundId: string): GlowKey {
    if (ROUND_GLOW[roundId] === undefined) return "lobby"
    return ROUND_GLOW[roundId]
}

export function glowKeyOf(roundId: string, stage: string): GlowKey {
    if (!isKnownRound(roundId)) return "lobby"
    if (isWaitingStage(stage)) return "lobby"
    // Về đích Riêng plays under a darker, single-spotlight stage.
    if (roundId === "ve-dich" && stage === "phase2") return "ve-dich-rieng"
    return roundGlowOf(roundId)
}

export function setGlow(key: GlowKey): void {
    document.documentElement.dataset.glow = key
}

export function useGlow(key: GlowKey, rest: GlowKey = "white"): void {
    useEffect(() => {
        setGlow(key)
        return () => setGlow(rest)
    }, [key, rest])
}
