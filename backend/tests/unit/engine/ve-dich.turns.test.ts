import { describe, expect, it } from "vitest";
import {
    VeDichRuleError,
    advanceTurn,
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
    type VeDichQuestion
} from "../../../src/game/engine/turns/ve-dich.js";

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
        const next = pickPhase1(state, "a", "THTH-50");
        expect(next.open?.question.id).toBe("THTH-50");
        expect(next.remaining.find((q) => q.id === "THTH-50")).toBeUndefined();
    });

    it("rejects a lower-value question while a higher one is still unchosen", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        expect(codeOf(() => pickPhase1(state, "a", "THTH-30"))).toBe("NOT_HIGHEST");
    });

    it("allows any of several tied top-value questions", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        expect(codeOf(() => pickPhase1(state, "a", "TNSS-50"))).toBe("NO_ERROR");
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

describe("Phase 1 scoring", () => {
    it("correct on a 30-pt question: +30", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        const opened = pickPhase1(state, "a", "THTH-50");
        const after = resolveQuestion(opened, { answerer: true });
        expect(after.players[0].score).toBe(50);
    });

    it("wrong on a 30-pt question: −15", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        const opened = pickPhase1(state, "a", "THTH-50");
        const after = resolveQuestion(opened, { answerer: false });
        expect(after.players[0].score).toBe(-25);
    });
});

describe("powers", () => {
    it("declared at open, spent, cannot be reused", () => {
        const base = createVeDich(POOL, [player("a", 0)]);
        const opened = pickPhase1(base, "a", "THTH-50");
        const withHope = declarePower(opened, "a", "HOPE");
        expect(withHope.open?.power).toBe("HOPE");
        expect(withHope.players[0].powersLeft).toEqual(["SHIELD"]);
    });

    it("HOPE on a 40-pt question, correct → +60 (worked example)", () => {
        const base = createVeDich(POOL, [player("a", 0)]);
        const opened = declarePower(pickPhase1(base, "a", "THTH-50"), "a", "HOPE");
        const after = resolveQuestion(opened, { answerer: true });
        expect(after.players[0].score).toBe(75);
    });

    it("cannot declare the same power twice across questions", () => {
        const base = createVeDich(POOL, [player("a", 0)]);
        const first = resolveQuestion(
            declarePower(pickPhase1(base, "a", "THTH-50"), "a", "HOPE"),
            { answerer: false }
        );
        const second = pickPhase1(first, "a", "TNSS-50");
        expect(codeOf(() => declarePower(second, "a", "HOPE"))).toBe("POWER_UNAVAILABLE");
    });

    it("both powers may be used in the same phase on different questions", () => {
        let state = createVeDich(POOL, [player("a", 0)]);
        state = resolveQuestion(declarePower(pickPhase1(state, "a", "THTH-50"), "a", "HOPE"), { answerer: true });
        state = resolveQuestion(declarePower(pickPhase1(state, "a", "TNSS-50"), "a", "SHIELD"), { answerer: true });
        expect(state.players[0].powersLeft).toEqual([]);
    });

    it("a declared power counts as spent even if the question is wrong (SHIELD: no penalty)", () => {
        const base = createVeDich(POOL, [player("a", 0)]);
        const after = resolveQuestion(
            declarePower(pickPhase1(base, "a", "THTH-50"), "a", "SHIELD"),
            { answerer: false }
        );
        expect(after.players[0].score).toBe(0);
        expect(after.players[0].powersLeft).toEqual(["HOPE"]);
    });

    it("only the current player may declare, and only at open", () => {
        const base = createVeDich(POOL, [player("a", 0), player("b", 0)]);
        const opened = pickPhase1(base, "a", "THTH-50");
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
        const phase1Done = { ...createVeDich(POOL, players), phase: 2 as const };
        return { ...phase1Done, players: orderForPhase(players, 2), turnIndex: 0 };
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
        state = closeCurrentAnswer(state);
        expect(state.open?.stage).toBe("buzz");
    });

    it("the fastest buzzer answers; later buzzes are blocked", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = closeCurrentAnswer(openPhase2Question(state, "THTH-50"));
        state = buzz(state, "a");
        expect(state.open?.buzzer).toBe("a");
        expect(codeOf(() => buzz(state, "b"))).toBe("ALREADY_OPEN");
    });

    it("the current player cannot buzz on their own question", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = closeCurrentAnswer(openPhase2Question(state, "THTH-50"));
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
        state = buzz(closeCurrentAnswer(openPhase2Question(state, "THTH-50")), "a");
        state = resolveQuestion(state, { answerer: true, buzzer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 + 50);
        expect(state.players.find((p) => p.id === "a")!.score).toBe(40 + 50);
    });

    it("current wrong, buzzer correct: current −25, buzzer +50", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = buzz(closeCurrentAnswer(openPhase2Question(state, "THTH-50")), "a");
        state = resolveQuestion(state, { answerer: false, buzzer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 - 25);
        expect(state.players.find((p) => p.id === "a")!.score).toBe(40 + 50);
    });

    it("no buzz, current correct: scores once", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = resolveQuestion(closeCurrentAnswer(openPhase2Question(state, "THTH-50")), { answerer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 + 50);
    });

    it("a buzzer verdict is required when someone buzzed, and forbidden when nobody did", () => {
        let withBuzz = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        withBuzz = buzz(closeCurrentAnswer(openPhase2Question(withBuzz, "THTH-50")), "a");
        expect(codeOf(() => resolveQuestion(withBuzz, { answerer: true }))).toBe("NOT_YOUR_TURN");

        let noBuzz = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        noBuzz = closeCurrentAnswer(openPhase2Question(noBuzz, "THTH-50"));
        expect(codeOf(() => resolveQuestion(noBuzz, { answerer: true, buzzer: true }))).toBe("NOT_YOUR_TURN");
    });

    it("the buzzer's power is not allowed: buzzers never declare powers", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        state = closeCurrentAnswer(state);
        state = buzz(state, "a");
        // Only the current player may declare, so a buzzer is rejected as NOT_YOUR_TURN.
        expect(codeOf(() => declarePower(state, "a", "HOPE"))).toBe("NOT_YOUR_TURN");
    });

    it("advanceTurn moves to the next player and clears the pending picks", () => {
        let state = pickPhase2(phase2State(), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = resolveQuestion(closeCurrentAnswer(openPhase2Question(state, "THTH-50")), { answerer: true });
        const next = advanceTurn(state);
        expect(next.turnIndex).toBe(1);
        expect(next.pendingPicks).toEqual([]);
    });
});
