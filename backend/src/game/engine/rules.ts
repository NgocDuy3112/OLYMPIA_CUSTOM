// The rulebook, resolved.
//
// A round's rules live in the tournament's rulebook (`tournaments.round_rules`), and the
// engine reads them. This module is where a rulebook entry becomes the numbers the
// engine uses: what the rulebook says, or the format's default where it says nothing.
//
// The defaults are the constants the engine always used — they are the format, and a
// rulebook that does not mention them keeps them.
import type { RoundConfig, TurnConfig } from "../contracts/index.js";

// ── khoi-dong: two phases, each with its own clock ───────────────────────────

export const KHOI_DONG_DEFAULTS = {
    phase1Questions: 6,
    phase1BudgetS: 45,
    phase2Questions: 6,
    phase2BudgetS: 60,
    pointsPerCorrect: 10
};

export interface KhoiDongRules {
    phase1Questions: number;
    phase1BudgetS: number;
    phase2Questions: number;
    phase2BudgetS: number;
    pointsPerCorrect: number;
}

export function khoiDongRules(config: RoundConfig | undefined): KhoiDongRules {
    const phase1 = turnOf(config, "phase1");
    const phase2 = turnOf(config, "phase2");

    return {
        phase1Questions: phase1?.questionCount ?? KHOI_DONG_DEFAULTS.phase1Questions,
        phase1BudgetS: phase1?.timeBudgetSeconds ?? KHOI_DONG_DEFAULTS.phase1BudgetS,
        phase2Questions: phase2?.questionCount ?? KHOI_DONG_DEFAULTS.phase2Questions,
        phase2BudgetS: phase2?.timeBudgetSeconds ?? KHOI_DONG_DEFAULTS.phase2BudgetS,
        pointsPerCorrect: constantPoints(config) ?? KHOI_DONG_DEFAULTS.pointsPerCorrect
    };
}

// ── giai-ma: the hints and the keyword ────────────────────────────────────────

export const GIAI_MA_DEFAULTS = {
    hintCount: 8,
    hintWindowS: 15,
    start: 100,
    dropPerHint: 10,
    floor: 20
};

export interface GiaiMaRules {
    hintCount: number;
    hintWindowS: number;
    start: number;          // the keyword's starting value
    dropPerHint: number;    // what each correct hint costs
    floor: number;          // the keyword never drops below this
}

export function giaiMaRules(config: RoundConfig | undefined): GiaiMaRules {
    const turn = firstTurn(config);
    const scoring = config?.scoring;

    const keyword = scoring && scoring.template === "keyword_derived" ? scoring : null;

    return {
        hintCount: turn?.hintCount ?? GIAI_MA_DEFAULTS.hintCount,
        hintWindowS: turn?.timeLimitSeconds ?? GIAI_MA_DEFAULTS.hintWindowS,
        start: keyword?.initial ?? GIAI_MA_DEFAULTS.start,
        dropPerHint: keyword?.dropPerHint ?? GIAI_MA_DEFAULTS.dropPerHint,
        floor: keyword?.floor ?? GIAI_MA_DEFAULTS.floor
    };
}

// ── but-pha: the sprint ───────────────────────────────────────────────────────

export const BUT_PHA_DEFAULTS = {
    questionCount: 4,
    questionLimitS: 30,
    bands: [
        { untilSec: 5, points: 15 },
        { untilSec: 15, points: 10 },
        { untilSec: 30, points: 5 }
    ],
    multipliers: [4, 3, 2],
    lateMultiplier: 1
};

export interface ButPhaRules {
    questionCount: number;
    questionLimitS: number;
    bands: Array<{ untilSec: number; points: number }>;
    multipliers: number[];
    lateMultiplier: number;
}

export function butPhaRules(config: RoundConfig | undefined): ButPhaRules {
    const turn = firstTurn(config);
    const scoring = config?.scoring;
    const sprint = scoring && scoring.template === "rank_multiplier" ? scoring : null;

    return {
        questionCount: turn?.questionCount ?? BUT_PHA_DEFAULTS.questionCount,
        questionLimitS: turn?.timeLimitSeconds ?? BUT_PHA_DEFAULTS.questionLimitS,
        bands: sprint?.bands ?? BUT_PHA_DEFAULTS.bands,
        multipliers: sprint?.multipliers ?? BUT_PHA_DEFAULTS.multipliers,
        lateMultiplier: sprint?.multipliers?.at(-1) ?? BUT_PHA_DEFAULTS.lateMultiplier
    };
}

// ── ve-dich: the main event ───────────────────────────────────────────────────

export const VE_DICH_DEFAULTS = {
    correctPct: 1,
    incorrectPct: -0.5,
    hope: { correct: 1.5, incorrect: -1 },
    shield: { correct: 0.5, incorrect: 0 },
    buzzWindowS: 5,
    pickCount: 3
};

export interface VeDichRules {
    correctPct: number;
    incorrectPct: number;
    hope: { correct: number; incorrect: number };
    shield: { correct: number; incorrect: number };
    buzzWindowS: number;
    pickCount: number;
}

export function veDichRules(config: RoundConfig | undefined): VeDichRules {
    const phase1 = turnOf(config, "phase1");
    const phase2 = turnOf(config, "phase2");
    const scoring = config?.scoring;
    const main = scoring && scoring.template === "outcome_multipliers" ? scoring : null;

    return {
        correctPct: main?.correct ?? VE_DICH_DEFAULTS.correctPct,
        incorrectPct: main?.incorrect ?? VE_DICH_DEFAULTS.incorrectPct,
        hope: main?.powers.hope ?? VE_DICH_DEFAULTS.hope,
        shield: main?.powers.shield ?? VE_DICH_DEFAULTS.shield,
        buzzWindowS: phase2?.buzzWindowSeconds ?? VE_DICH_DEFAULTS.buzzWindowS,
        pickCount: phase2?.pickCount ?? VE_DICH_DEFAULTS.pickCount
    };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function turnOf(config: RoundConfig | undefined, id: string): TurnConfig | undefined {
    return config?.turns.find((turn) => turn.id === id);
}

function firstTurn(config: RoundConfig | undefined): TurnConfig | undefined {
    return config?.turns[0];
}

function constantPoints(config: RoundConfig | undefined): number | undefined {
    const scoring = config?.scoring;
    return scoring && scoring.template === "constant" ? scoring.points : undefined;
}
