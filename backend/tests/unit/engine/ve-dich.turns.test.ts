import { describe, expect, it } from "vitest";
import {
    VeDichRuleError,
    advanceTurn,
    beginPhase2,
    endVeDich,
    isBuzzOpen,
    phase1Complete,
    phase2Complete,
    buzz,
    closeCurrentAnswer,
    createVeDich,
    declarePower,
    openPhase2Question,
    orderForPhase,
    pickPhase1,
    pickPhase2,
    resolveQuestion,
    type PlayerState,
    type VeDichQuestion,
    type VeDichState
} from "../../../src/game/engine/turns/ve-dich.js";

const NOW = "2026-01-01T00:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(NOW) + sec * 1000).toISOString();

const Q = (domain: string, value: number): VeDichQuestion => ({
    id: `${domain}-${value}`,
    domain,
    value
});

// Small pool for readability: one question per value across two domains.
const POOL: VeDichQuestion[] = [
    Q("THTH", 50), Q("THTH", 40), Q("THTH", 30), Q("THTH", 20),
    Q("TNSS", 50), Q("TNSS", 40), Q("TNSS", 30), Q("TNSS", 20)
];

const player = (id: string, score: number): PlayerState => ({
    id,
    score,
    powersLeft: ["HOPE", "SHIELD"]
});

function codeOf(fn: () => unknown): string {
    try {
        fn();
    } catch (e) {
        if (e instanceof VeDichRuleError) return e.detail.code;
        throw e;
    }
    return "NO_ERROR";
}

describe("turn order", () => {
    const players = [player("a", 40), player("b", 90), player("c", 10)];

    it("Phase 1 orders highest score first", () => {
        expect(orderForPhase(players, 1).map((p) => p.id)).toEqual(["b", "a", "c"]);
    });

    it("Phase 2 orders lowest score first", () => {
        expect(orderForPhase(players, 2).map((p) => p.id)).toEqual(["c", "a", "b"]);
    });

    it("createVeDich starts in Phase 1 with that order", () => {
        const state = createVeDich(POOL, players);
        expect(state.phase).toBe(1);
        expect(state.players[0].id).toBe("b");
    });
});

describe("Phase 1 picks", () => {
    it("the current player takes the highest-value question", () => {
        const state = createVeDich(POOL, [player("a", 0), player("b", 0)]);
        const next = pickPhase1(state, "a", "THTH-30");
        expect(next.open?.question.id).toBe("THTH-30");
        expect(next.remaining.find((q) => q.id === "THTH-30")).toBeUndefined();
    });

    it("rejects a lower-value question while a higher one is still unchosen", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        expect(codeOf(() => pickPhase1(state, "a", "THTH-20"))).toBe("NOT_HIGHEST");
    });

    it("allows any of several tied top-value questions", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        expect(codeOf(() => pickPhase1(state, "a", "TNSS-30"))).toBe("NO_ERROR");
    });

    it("rejects a pick from a player whose turn it is not", () => {
        const state = createVeDich(POOL, [player("a", 90), player("b", 0)]);
        expect(codeOf(() => pickPhase1(state, "b", "THTH-50"))).toBe("NOT_YOUR_TURN");
    });

    it("rejects a pick in Phase 2 mode", () => {
        const state = { ...createVeDich(POOL, [player("a", 0)]), phase: 2 as const };
        expect(codeOf(() => pickPhase1(state, "a", "THTH-50"))).toBe("WRONG_PHASE");
    });
});

describe("Chung is a 20/30 table — the partition rule", () => {
    it("phase 1 offers only 20s and 30s; 40/50 wait in deferred", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        expect(state.remaining.map((q) => q.value).sort((x, y) => x - y)).toEqual([20, 20, 30, 30]);
        expect(state.deferred?.map((q) => q.value).sort((x, y) => x - y)).toEqual([40, 40, 50, 50]);
    });

    it("a 40/50 cell can never open in phase 1 — not even by id", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        expect(codeOf(() => pickPhase1(state, "a", "THTH-50"))).toBe("INVALID_QUESTION");
        expect(codeOf(() => pickPhase1(state, "a", "THTH-40"))).toBe("INVALID_QUESTION");
    });

    it("the summit pool = deferred 40/50 PLUS every unplayed 20/30", () => {
        const state = beginPhase2(createVeDich(POOL, [player("a", 0)]));
        expect(state.remaining).toHaveLength(POOL.length);
        expect(state.remaining.map((q) => q.value).sort((x, y) => x - y))
            .toEqual([20, 20, 30, 30, 40, 40, 50, 50]);
        expect(state.deferred).toEqual([]);
    });
});

describe("Phase 1 scoring", () => {
    it("correct on a 30-pt question: +30", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        const opened = pickPhase1(state, "a", "THTH-30");
        const after = resolveQuestion(opened, { answerer: true });
        expect(after.players[0].score).toBe(30);
    });

    it("wrong on a 30-pt question: −15", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        const opened = pickPhase1(state, "a", "THTH-30");
        const after = resolveQuestion(opened, { answerer: false });
        expect(after.players[0].score).toBe(-15);
    });
});

describe("powers", () => {
    it("declared at open, spent, cannot be reused", () => {
        const base = createVeDich(POOL, [player("a", 0)]);
        const opened = pickPhase1(base, "a", "THTH-30");
        const withHope = declarePower(opened, "a", "HOPE");
        expect(withHope.open?.power).toBe("HOPE");
        expect(withHope.players[0].powersLeft).toEqual(["SHIELD"]);
    });

    it("HOPE on a 40-pt question, correct → +60 (worked example)", () => {
        // 40/50 cells live in the summit now — open one through the REAL phase 2
        // (untouched phase 1 may skip straight there).
        let s = beginPhase2(createVeDich(POOL, [player("a", 0)]));
        s = pickPhase2(s, "a", ["THTH-40", "THTH-50", "THTH-30"]);
        s = declarePower(openPhase2Question(s, "THTH-40"), "a", "HOPE");
        s = closeCurrentAnswer(s, NOW);   // phase 2 resolves through the window
        const after = resolveQuestion(s, { answerer: true });
        expect(after.players[0].score).toBe(60);
    });

    it("cannot declare the same power twice across questions", () => {
        const base = createVeDich(POOL, [player("a", 0)]);
        const first = resolveQuestion(
            declarePower(pickPhase1(base, "a", "THTH-30"), "a", "HOPE"),
            { answerer: false }
        );
        const second = pickPhase1(first, "a", "TNSS-30");
        expect(codeOf(() => declarePower(second, "a", "HOPE"))).toBe("POWER_UNAVAILABLE");
    });

    it("both powers may be used in the same phase on different questions", () => {
        let state = createVeDich(POOL, [player("a", 0)]);
        state = resolveQuestion(declarePower(pickPhase1(state, "a", "THTH-30"), "a", "HOPE"), { answerer: true });
        state = resolveQuestion(declarePower(pickPhase1(state, "a", "TNSS-30"), "a", "SHIELD"), { answerer: true });
        expect(state.players[0].powersLeft).toEqual([]);
    });

    it("a declared power counts as spent even if the question is wrong (SHIELD: no penalty)", () => {
        const base = createVeDich(POOL, [player("a", 0)]);
        const after = resolveQuestion(
            declarePower(pickPhase1(base, "a", "THTH-30"), "a", "SHIELD"),
            { answerer: false }
        );
        expect(after.players[0].score).toBe(0);
        expect(after.players[0].powersLeft).toEqual(["HOPE"]);
    });

    it("only the current player may declare, and only at open", () => {
        const base = createVeDich(POOL, [player("a", 0), player("b", 0)]);
        const opened = pickPhase1(base, "a", "THTH-30");
        expect(codeOf(() => declarePower(opened, "b", "HOPE"))).toBe("NOT_YOUR_TURN");
    });

    it("a power cannot be declared without an open question", () => {
        const base = createVeDich(POOL, [player("a", 0)]);
        expect(codeOf(() => declarePower(base, "a", "HOPE"))).toBe("NOTHING_OPEN");
    });
});

describe("Phase 2 flow", () => {
    // Phase 2: lowest score plays first. Player "c" (score 10) starts.
    const players = [player("a", 40), player("b", 90), player("c", 10)];

    function phase2State() {
        // The REAL transition: phase, lowest-first order, turn reset AND the
        // pool merge (deferred 40/50 join the unplayed 20/30s).
        return beginPhase2(createVeDich(POOL, players));
    }

    it("the current player picks exactly 3 distinct questions", () => {
        const state = phase2State();
        expect(codeOf(() => pickPhase2(state, "c", ["THTH-50", "THTH-40"]))).toBe("INVALID_QUESTION");
        expect(codeOf(() => pickPhase2(state, "c", ["THTH-50", "THTH-50", "THTH-40"]))).toBe("INVALID_QUESTION");
        expect(codeOf(() => pickPhase2(state, "c", ["THTH-50", "THTH-40", "THTH-30"]))).toBe("NO_ERROR");
    });

    it("the buzz window opens after the current answer, whatever its correctness", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        state = closeCurrentAnswer(state, NOW);
        expect(state.open?.stage).toBe("buzz");
    });

    it("the fastest buzzer answers; later buzzes are blocked", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW);
        state = buzz(state, "a");
        expect(state.open?.buzzer).toBe("a");
        expect(codeOf(() => buzz(state, "b"))).toBe("ALREADY_OPEN");
    });

    it("the current player cannot buzz on their own question", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW);
        expect(codeOf(() => buzz(state, "c"))).toBe("NOT_YOUR_TURN");
    });

    it("buzzing is impossible before the buzz window", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        expect(codeOf(() => buzz(state, "a"))).toBe("ALREADY_OPEN");
    });

    it("the question cannot be resolved before the buzz window closes", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        expect(codeOf(() => resolveQuestion(state, { answerer: true }))).toBe("ALREADY_OPEN");
    });

    it("both correct: current and buzzer each get face value (+50 each)", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = buzz(closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW), "a");
        state = resolveQuestion(state, { answerer: true, buzzer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 + 50);
        expect(state.players.find((p) => p.id === "a")!.score).toBe(40 + 50);
    });

    it("current wrong, buzzer correct: current −25, buzzer +50", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = buzz(closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW), "a");
        state = resolveQuestion(state, { answerer: false, buzzer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 - 25);
        expect(state.players.find((p) => p.id === "a")!.score).toBe(40 + 50);
    });

    it("no buzz, current correct: scores once", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = resolveQuestion(closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW), { answerer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 + 50);
    });

    it("a buzzer verdict is required when someone buzzed, and forbidden when nobody did", () => {
        let withBuzz = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        withBuzz = buzz(closeCurrentAnswer(openPhase2Question(withBuzz, "THTH-50"), NOW), "a");
        expect(codeOf(() => resolveQuestion(withBuzz, { answerer: true }))).toBe("NOT_YOUR_TURN");

        let noBuzz = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        noBuzz = closeCurrentAnswer(openPhase2Question(noBuzz, "THTH-50"), NOW);
        expect(codeOf(() => resolveQuestion(noBuzz, { answerer: true, buzzer: true }))).toBe("NOT_YOUR_TURN");
    });

    it("the buzzer's power is not allowed: buzzers never declare powers", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        state = closeCurrentAnswer(state, NOW);
        state = buzz(state, "a");
        // Only the current player may declare, so a buzzer is rejected as NOT_YOUR_TURN.
        expect(codeOf(() => declarePower(state, "a", "HOPE"))).toBe("NOT_YOUR_TURN");
    });

    it("advanceTurn moves to the next player and clears the pending picks", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = resolveQuestion(closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW), { answerer: true });
        const next = advanceTurn(state);
        expect(next.turnIndex).toBe(1);
        expect(next.pendingPicks).toEqual([]);
    });
});

describe("phase transitions", () => {
    const players = [player("a", 40), player("b", 90), player("c", 10)];

    // Phase 1 is complete once every player has had a turn.
    function phase1Done() {
        let s = createVeDich(POOL, players);
        for (let i = 0; i < players.length; i++) s = advanceTurn(s);
        return s;
    }

    it("phase 1 is not complete until every player has had a turn", () => {
        let s = createVeDich(POOL, players);
        expect(phase1Complete(s)).toBe(false);
        s = advanceTurn(s);
        s = advanceTurn(s);
        expect(phase1Complete(s)).toBe(false);
        s = advanceTurn(s);
        expect(phase1Complete(s)).toBe(true);
    });

    it("an open question blocks completion", () => {
        const done = phase1Done();
        // A question is in play: the phase is not over, whatever the turn cursor says.
        const withOpen = {
            ...done,
            open: {
                question: done.remaining[0],
                answerer: "b",
                power: null,
                stage: "current" as const,
                buzzer: null
            }
        };
        expect(phase1Complete(withOpen)).toBe(false);
    });

    it("beginPhase2 reorders by score (lowest first) and resets the turn", () => {
        const s = beginPhase2(phase1Done());
        expect(s.phase).toBe(2);
        expect(s.players.map((p) => p.id)).toEqual(["c", "a", "b"]);
        expect(s.turnIndex).toBe(0);
        expect(s.pendingPicks).toEqual([]);
    });

    it("beginPhase2 skips an untouched phase 1 but refuses a touched one", () => {
        // Untouched → "Về đích · Riêng" may start the summit directly (confirmed rule);
        // one completed turn = touched → PHASE1_INCOMPLETE keeps guarding.
        expect(beginPhase2(createVeDich(POOL, players)).phase).toBe(2);
        expect(codeOf(() => beginPhase2(advanceTurn(createVeDich(POOL, players))))).toBe("PHASE1_INCOMPLETE");
    });

    it("beginPhase2 cannot run twice", () => {
        const s = beginPhase2(phase1Done());
        expect(codeOf(() => beginPhase2(s))).toBe("WRONG_PHASE");
    });

    it("phase 2 completes when every player has had a turn and nothing is open", () => {
        let s = beginPhase2(phase1Done());
        expect(phase2Complete(s)).toBe(false);
        for (let i = 0; i < players.length; i++) s = advanceTurn(s);
        expect(phase2Complete(s)).toBe(true);
    });

    it("endVeDich sets the round ended and clears the open question", () => {
        let s = createVeDich(POOL, [player("a", 0)]);
        s = pickPhase1(s, "a", "THTH-30");
        const ended = endVeDich(s);
        expect(ended.ended).toBe(true);
        expect(ended.open).toBeNull();
    });
});

describe("the 5 s buzz window", () => {
    const players = [player("a", 40), player("b", 90), player("c", 10)];

    function buzzing() {
        let s: VeDichState = beginPhase2(createVeDich(POOL, players));
        s = pickPhase2(s, "c", ["THTH-50", "THTH-40", "THTH-30"]);
        s = openPhase2Question(s, "THTH-50");
        return closeCurrentAnswer(s, NOW);
    }

    it("is closed before the current answer is closed", () => {
        expect(isBuzzOpen(openPhase2Question(
            pickPhase2(beginPhase2(createVeDich(POOL, players)),
                "c", ["THTH-50", "THTH-40", "THTH-30"]),
            "THTH-50"
        ), NOW)).toBe(false);
    });

    it("is open for exactly five seconds", () => {
        const s = buzzing();
        expect(isBuzzOpen(s, NOW)).toBe(true);
        expect(isBuzzOpen(s, at(5))).toBe(true);
        expect(isBuzzOpen(s, at(5.001))).toBe(false);
    });

    it("is closed in phase 1", () => {
        expect(isBuzzOpen(createVeDich(POOL, players), NOW)).toBe(false);
    });

    it("resolving the question closes the window", () => {
        const s = resolveQuestion(buzzing(), { answerer: true });
        expect(isBuzzOpen(s, NOW)).toBe(false);
    });
});
