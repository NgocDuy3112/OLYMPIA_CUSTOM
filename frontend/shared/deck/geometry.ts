import { type CSSProperties } from "react"

// ── deck geometry & helpers (OC3.pptm inches → canvas units) ─────────────────
// No components in this file (react-refresh): the pure math, constants and
// labels the deck's components and screens share — the PLAYER deck lives here
// (@shared/deck/player-deck), the MC's drawn console keeps its own primitives.
//
// Shared by both apps: the portal's MC deck and the gameplay app's player deck
// must agree on the canvas, so the geometry has exactly one source of truth.

export const CANVAS_W = 13.3333
export const CANVAS_H = 7.5
export const px = (i: number) => `${+((i / CANVAS_W) * 100).toFixed(3)}%`
export const py = (i: number) => `${+((i / CANVAS_H) * 100).toFixed(3)}%`
const PT_SCALE = 0.75
export const pt = (v: number) => `${+(((v * PT_SCALE) / 72 / CANVAS_W) * 100).toFixed(3)}cqw`
export const STRIP_R = `${+(((0.44 * 0.31623) / CANVAS_W) * 100).toFixed(3)}cqw`
/** PowerPoint's default text insets (verified across all 406 bodyPr in the deck). */
export const DECK_PAD: CSSProperties = {
    paddingLeft: "0.75cqw",
    paddingRight: "0.75cqw",
    paddingTop: "0.375cqw",
    paddingBottom: "0.375cqw",
}

// Everything sits this much lower on the deck than the template — shrinking it
// trims the visible top gap above the card (user: "make the top padding smaller").
export const TOP_SHIFT = 0.25

/** A child box in deck inches relative to its card → % of that card. */
export const at = (cardW: number, cardH: number) => (x: number, y: number, w: number, h: number): CSSProperties => ({
    position: "absolute",
    left: `${+((x / cardW) * 100).toFixed(3)}%`,
    top: `${+((y / cardH) * 100).toFixed(3)}%`,
    width: `${+((w / cardW) * 100).toFixed(3)}%`,
    height: `${+((h / cardH) * 100).toFixed(3)}%`,
})

// ── deck labels ──────────────────────────────────────────────────────────────
export const ROUND_LABEL: Record<string, string> = {
    "khoi-dong": "Khởi động",
    "giai-ma": "Giải mã",
    "but-pha": "Bứt phá",
    "ve-dich": "Về đích",
}

/** A round the deck knows — anything else has NO screen and waits in the lobby. */
export const isKnownRound = (roundId: string): boolean => roundId in ROUND_LABEL

// Stages where NO round screen renders — the lobby does. (The khoi-dong engine
// never sends "ended" — it stops at phase2 — but a waiting stage still covers
// it defensively, with no round-specific branch anywhere.)
const WAITING_STAGES = new Set(["pending", "ended", "unknown"])
export const isWaitingStage = (stage: string): boolean => WAITING_STAGES.has(stage)

/** Two digits — the clock shows SECONDS only (user: "displayed at 2 digits").
 *  Round budgets run ≤ 60s, so `m:ss` collapses to its seconds field. */
export const toClock = (text: string): string => {
    const seconds = /^\d+$/.test(text)
        ? Number(text)
        : text.split(":").reduce((total, part) => total * 60 + Number(part), 0)
    if (Number.isNaN(seconds)) return text
    return String(seconds).padStart(2, "0")
}
