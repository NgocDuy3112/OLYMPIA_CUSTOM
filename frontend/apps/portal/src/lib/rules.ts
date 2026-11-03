import { ROUND_LABEL } from "@shared/deck/geometry"
import type { RoundConfig, TournamentDetail } from "@/lib/tournament"
import type { TournamentRound } from "@/lib/tournaments"

// The shape of a round's rules, and how to read them. Pure helpers, shared by the
// read surface and the edit dialog.

const KINDS = ["CHOICE", "TEXT", "KEYWORD", "HINT"] as const
export type Kind = (typeof KINDS)[number]
export const KINDS_LIST = KINDS

// What a round needs at minimum: one turn that declares how many questions it eats.
export function emptyConfig(): RoundConfig {
    return {
        allowedKinds: ["CHOICE"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 0 }],
    }
}

// The rules a tournament holds, or the template for one it doesn't have yet.
export function draftFrom(tournament: TournamentDetail): Record<string, RoundConfig> {
    return Object.fromEntries(
        tournament.rounds.map((round) => [round.id, tournament.roundRules?.[round.id] ?? emptyConfig()])
    )
}

export const questionCountOf = (config: RoundConfig) =>
    config.turns.reduce((sum, turn) => sum + (turn.questionCount ?? 0), 0)

export const kindsLabel = (config: RoundConfig) =>
    config.allowedKinds.length === 0 ? "none" : config.allowedKinds.join(" · ")

export const pointsLabel = (config: RoundConfig) =>
    config.scoring.template === "constant" ? `${config.scoring.points} pts` : `from ${config.scoring.template}`

// ── The round LIST — which rounds this tournament plays, in what order ────────
//
// The list is the tournament's spine: the "Round rules" tab draws one section per
// entry, and going LIVE seeds the match's live record with the FIRST one. A
// tournament with no rounds therefore has nothing to configure and nothing to
// start — which is exactly what an empty list looks like.
//
// Offer ONLY the rounds the deck has a module for: a typo'd id would create a
// round the console cannot draw, and the players would sit in the lobby waiting
// for a screen that will never come.

export interface KnownRound {
    id: string
    name: string
}

/** The rounds a tournament may be composed of (the deck's own registry). */
export const KNOWN_ROUNDS: KnownRound[] = Object.entries(ROUND_LABEL).map(([id, name]) => ({ id, name }))

/** Renumber to 0..n-1 in list order — `order` is what the engine reads. */
export function withOrder(rounds: TournamentRound[]): TournamentRound[] {
    return rounds.map((round, index) => ({ ...round, order: index }))
}

/** Is this round in the list? */
export function hasRound(rounds: TournamentRound[], id: string): boolean {
    return rounds.some((round) => round.id === id)
}

/**
 * Check / uncheck a round. Adding appends it at the END (a new round is played
 * after the ones already chosen); removing closes the gap and renumbers, so the
 * list can never hold a hole for the engine to trip on.
 */
export function toggleRound(rounds: TournamentRound[], id: string, name: string): TournamentRound[] {
    if (hasRound(rounds, id)) return withOrder(rounds.filter((round) => round.id !== id))
    return withOrder([...rounds, { id, name, order: rounds.length, chart: "bars" }])
}

/** Move a round one slot up (-1) or down (+1); edges are no-ops. */
export function moveRound(rounds: TournamentRound[], id: string, direction: -1 | 1): TournamentRound[] {
    const from = rounds.findIndex((round) => round.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= rounds.length) return rounds
    const next = [...rounds]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return withOrder(next)
}

/** The configs for a list: what the tournament already saved, else the template. */
export function configsFor(
    rounds: TournamentRound[],
    saved: Record<string, RoundConfig> | null
): Record<string, RoundConfig> {
    return Object.fromEntries(rounds.map((round) => [round.id, saved?.[round.id] ?? emptyConfig()]))
}
