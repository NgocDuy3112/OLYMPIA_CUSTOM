// The AOC rulebook — the one place the four rounds and their rules are stated.
//
// They used to be a form: an operator checked the rounds and typed the scoring,
// question counts and question kinds. That put the show's rules — which the engine
// already knows and enforces — in front of someone who should be running a match,
// and every value they could type had a default behind it anyway.
//
// So the rulebook lives here, as data:
//  · `AOC_ROUNDS` — the four rounds, in playing order (a new tournament gets them);
//  · `aocRoundConfig` — each round's canonical rules, which the engine's resolvers
//    (`rules.ts`) turn into numbers. They are the SAME numbers as those defaults;
//    `aoc-rulebook.test.ts` asserts it, so this table can never drift from the
//    engine it feeds.
//
// A round missing from a tournament's saved rulebook falls back to this, so a
// tournament needs no rulebook at all to be playable.
import type { RoundConfig, TournamentRound } from "../contracts/index.js";

/** The AOC rounds, in the order a show plays them. */
export const AOC_ROUNDS: TournamentRound[] = [
    { id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" },
    { id: "giai-ma", name: "Giải mã", order: 1, chart: "bars" },
    { id: "but-pha", name: "Bứt phá", order: 2, chart: "bars" },
    { id: "ve-dich", name: "Về đích", order: 3, chart: "bars" }
];

const RULES: Record<string, RoundConfig> = {
    // Two phases: six oral runs on a 45 s budget, then the six-question timed
    // batch — everyone types into one 10 s window the console opens.
    "khoi-dong": {
        allowedKinds: ["TEXT"],
        scoring: { template: "constant", points: 10 },
        turns: [
            {
                id: "phase1",
                mode: "oral",
                delivery: "sequential",
                questionCount: 6,
                timeBudgetSeconds: 45
            },
            {
                id: "phase2",
                mode: "text",
                delivery: "batch",
                questionCount: 6,
                timeLimitSeconds: 10
            }
        ]
    },
    // The hints and the keyword: eight hints on a 15 s window, keyword 100 → 20.
    "giai-ma": {
        allowedKinds: ["KEYWORD", "HINT"],
        scoring: { template: "keyword_derived", initial: 100, dropPerHint: 10, floor: 20, incorrect: 0 },
        turns: [
            {
                id: "phase1",
                mode: "text",
                delivery: "batch",
                questionCount: 8,
                hintCount: 8,
                timeLimitSeconds: 15
            }
        ]
    },
    // The sprint: four questions, answers ranked by speed.
    //
    // FLAT points on purpose: the spot points and the 4/3/2 ladder come from
    // `BUT_PHA_DEFAULTS`. Naming `rank_multiplier` here would re-state them, and the
    // resolver derives `lateMultiplier` from `multipliers.at(-1)` — which is 2, not
    // the default 1. Saying nothing keeps the engine's own numbers, exactly.
    "but-pha": {
        allowedKinds: ["CHOICE"],
        scoring: { template: "constant", points: 10 },
        turns: [
            {
                id: "phase1",
                mode: "text",
                delivery: "batch",
                questionCount: 4,
                timeLimitSeconds: 30
            }
        ]
    },
    // The main event: board picks, then answers at ±100% / −50%, STAR ×1.5 / −1.
    "ve-dich": {
        allowedKinds: ["CHOICE"],
        scoring: {
            template: "outcome_multipliers",
            correct: 1,
            incorrect: -0.5,
            powers: { star: { correct: 1.5, incorrect: -1 } }
        },
        turns: [
            {
                id: "phase1",
                mode: "text",
                delivery: "pick",
                pickCount: 3
            },
            {
                id: "phase2",
                mode: "oral",
                delivery: "sequential",
                buzzWindowSeconds: 5,
                pickCount: 3
            }
        ]
    }
};

/** The rules of one AOC round — the fallback when a tournament saved none. */
export function aocRoundConfig(roundId: string): RoundConfig | null {
    return RULES[roundId] ?? null;
}

/**
 * A tournament's effective rulebook: what it saved, and this file's default for
 * every round it left unset. Callers never have to know whether an operator ever
 * filled the form in — and since the form is gone, most tournaments saved nothing.
 */
export function resolveRoundRules(
    rounds: Array<{ id: string }>,
    saved: Record<string, RoundConfig> | null | undefined
): Record<string, RoundConfig> {
    const resolved: Record<string, RoundConfig> = {};
    for (const round of rounds) {
        const config = saved?.[round.id] ?? aocRoundConfig(round.id);
        if (config) resolved[round.id] = config;
    }
    return resolved;
}

/** True for a round this app knows how to play (the deck has a module for it). */
export function isAocRound(roundId: string): boolean {
    return roundId in RULES;
}
