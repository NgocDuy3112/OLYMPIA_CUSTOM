import type { RoundConfig, TournamentDetail } from "@/lib/tournament"

// The shape of a round's rules, and how to read them. Pure helpers, shared by the
// read surface and the edit dialog.

const KINDS = ["MC", "TEXT", "KEYWORD"] as const
export type Kind = (typeof KINDS)[number]
export const KINDS_LIST = KINDS

// What a round needs at minimum: one turn that declares how many questions it eats.
export function emptyConfig(): RoundConfig {
    return {
        allowedKinds: ["MC"],
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
