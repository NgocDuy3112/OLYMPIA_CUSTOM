import type { RoundConfig, TournamentRound } from "../contracts/index.js";

export const AOC_ROUNDS: TournamentRound[] = [
    { id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" },
    { id: "giai-ma", name: "Giải mã", order: 1, chart: "bars" },
    { id: "but-pha", name: "Bứt phá", order: 2, chart: "bars" },
    { id: "ve-dich", name: "Về đích", order: 3, chart: "bars" }
];

const RULES: Record<string, RoundConfig> = {
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
    "but-pha": {
        allowedKinds: ["TEXT"],
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
    "ve-dich": {
        allowedKinds: ["TEXT"],
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

export function aocRoundConfig(roundId: string): RoundConfig | null {
    return RULES[roundId] ?? null;
}

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

export function isAocRound(roundId: string): boolean {
    return roundId in RULES;
}
