import { describe, expect, it } from "vitest";
import {
    BOARD_COMPOSITION,
    VeDichRuleError,
    advanceTurn,
    beginPhase2,
    endVeDich,
    isBuzzOpen,
    phase1Complete,
    phase2Complete,
    buzz,
    buzzWindowSeconds,
    lockBuzzWindow,
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

// The board's cells are identified by their frozen id and sized by their value;
// the label is only a test handle ("THTH-40" reads better than a uuid).
const Q = (label: string, value: number, timeLimit: number | null = 30): VeDichQuestion => ({ id: `${label}-${value}`, value, timeLimit });

// A REAL board: 6×20, 6×30, 4×40, 4×50 — createVeDich refuses anything else, so
// a fixture that is not the show's composition cannot even build a round.
const board = (): VeDichQuestion[] => [
    Q("THTH", 20), Q("TNSS", 20), Q("A", 20), Q("B", 20), Q("C", 20), Q("D", 20),
    Q("THTH", 30), Q("TNSS", 30), Q("E", 30), Q("F", 30), Q("G", 30), Q("H", 30),
    Q("THTH", 40), Q("TNSS", 40), Q("I", 40), Q("J", 40),
    Q("THTH", 50), Q("TNSS", 50), Q("K", 50), Q("L", 50)
];
const POOL: VeDichQuestion[] = board();
const countOf = (qs: VeDichQuestion[], value: number) => qs.filter((q) => q.value === value).length;

const player = (id: string, score: number): PlayerState => ({
    id,
    score,
    powersLeft: ["STAR", "ASSIGN"]
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

describe("the board's composition", () => {
    const players_ = [player("a", 0)];

    it("accepts the show's board: 6×20, 6×30, 4×40, 4×50", () => {
        expect(() => createVeDich(board(), players_)).not.toThrow();
        expect(BOARD_COMPOSITION).toEqual({ 20: 6, 30: 6, 40: 4, 50: 4 });
    });

    it("refuses a board with the wrong counts — the classic 24-cell grid is no longer a round", () => {
        const sixByFour = [20, 30, 40, 50].flatMap((value) =>
            ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"].map((label) => Q(label, value))
        );
        expect(sixByFour).toHaveLength(24);
        expect(codeOf(() => createVeDich(sixByFour, players_))).toBe("BOARD_COMPOSITION");
    });

    it("refuses a face value the board never holds, and says what it got", () => {
        const odd = [...board().slice(0, 19), Q("ODD", 60)];
        expect(codeOf(() => createVeDich(odd, players_))).toBe("BOARD_COMPOSITION");
        try {
            createVeDich(odd, players_);
        } catch (e) {
            expect((e as VeDichRuleError).detail.message).toContain("60×1 (not a face value)");
            expect((e as VeDichRuleError).detail.message).toContain("50×3 (want 4)");
        }
    });
});

describe("Phase 1 picks", () => {
    it("the current player takes the highest-value question", () => {
        const state = createVeDich(POOL, [player("a", 0), player("b", 0)]);
        const next = pickPhase1(state, "a", "THTH-30");
        expect(next.open?.question.id).toBe("THTH-30");
        expect(next.remaining.find((q) => q.id === "THTH-30")).toBeUndefined();
    });

    it("picks either band: a 20 while 30s are still free (the show's rule)", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        const next = pickPhase1(state, "a", "THTH-20");
        expect(next.open?.question.id).toBe("THTH-20");
        expect(next.remaining.find((q) => q.id === "THTH-20")).toBeUndefined();
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
        expect(countOf(state.remaining, 20)).toBe(6);
        expect(countOf(state.remaining, 30)).toBe(6);
        expect(state.remaining.every((q) => q.value === 20 || q.value === 30)).toBe(true);
        expect(countOf(state.deferred ?? [], 40)).toBe(4);
        expect(countOf(state.deferred ?? [], 50)).toBe(4);
    });

    it("a 40/50 cell can never open in phase 1 — not even by id", () => {
        const state = createVeDich(POOL, [player("a", 0)]);
        expect(codeOf(() => pickPhase1(state, "a", "THTH-50"))).toBe("INVALID_QUESTION");
        expect(codeOf(() => pickPhase1(state, "a", "THTH-40"))).toBe("INVALID_QUESTION");
    });

    it("the summit pool = deferred 40/50 PLUS every unplayed 20/30", () => {
        const state = beginPhase2(createVeDich(POOL, [player("a", 0)]));
        expect(state.remaining).toHaveLength(POOL.length);      // all 20 cells
        expect(countOf(state.remaining, 40)).toBe(4);
        expect(countOf(state.remaining, 50)).toBe(4);
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

describe("powers — STAR", () => {
    const riengOpen = () => {
        let s = beginPhase2(createVeDich(POOL, [player("a", 0), player("b", 0)]));
        s = pickPhase2(s, s.players[0].id, ["THTH-40", "THTH-50", "THTH-30"]);
        return { state: s, a: s.players[0].id };
    };

    it("is a RIÊNG rule — Chung refuses every power", () => {
        const chung = pickPhase1(createVeDich(POOL, [player("a", 0)]), "a", "THTH-30");
        expect(codeOf(() => declarePower(chung, "a", "STAR"))).toBe("WRONG_PHASE_FOR_POWER");
    });

    it("only the player whose question it is may declare — the room cannot", () => {
        const { state, a } = riengOpen();
        const opened = openPhase2Question(state, "THTH-40");
        const other = state.players.find((p) => p.id !== a)!.id;
        expect(codeOf(() => declarePower(opened, other, "STAR"))).toBe("NOT_YOUR_TURN");
        expect(codeOf(() => declarePower(opened, other, "ASSIGN", { targetId: a, nowIso: NOW })))
            .toBe("NOT_YOUR_TURN");
    });

    it("is declared at open, spent, and cannot be reused", () => {
        const { state, a } = riengOpen();
        const withStar = declarePower(openPhase2Question(state, "THTH-40"), a, "STAR");
        expect(withStar.open?.power).toBe("STAR");
        expect(withStar.players.find((p) => p.id === a)!.powersLeft).toEqual(["ASSIGN"]);
    });

    it("STAR on a 40-pt question, correct → +60 (worked example)", () => {
        const { state, a } = riengOpen();
        let s = declarePower(openPhase2Question(state, "THTH-40"), a, "STAR");
        s = closeCurrentAnswer(s, NOW);
        const after = resolveQuestion(s, { answerer: true });
        expect(after.players.find((p) => p.id === a)!.score).toBe(60);
    });

    it("a declared STAR is spent even when the answer is wrong (−100%)", () => {
        const { state, a } = riengOpen();
        const after = resolveQuestion(
            closeCurrentAnswer(declarePower(openPhase2Question(state, "THTH-40"), a, "STAR"), NOW),
            { answerer: false }
        );
        expect(after.players.find((p) => p.id === a)!.score).toBe(-40);
        expect(after.players.find((p) => p.id === a)!.powersLeft).toEqual(["ASSIGN"]);
    });
});

describe("powers — ASSIGN", () => {
    const twoUp = () => {
        let s = beginPhase2(createVeDich(POOL, [player("a", 0), player("b", 0), player("c", 0)]));
        s = pickPhase2(s, s.players[0].id, ["THTH-40", "THTH-50", "THTH-30"]);
        return s;
    };

    it("is Riêng only — Chung refuses it", () => {
        const chung = pickPhase1(createVeDich(POOL, [player("a", 0), player("b", 0)]), "a", "THTH-30");
        expect(codeOf(() => declarePower(chung, "a", "ASSIGN", { targetId: "b", nowIso: NOW })))
            .toBe("WRONG_PHASE_FOR_POWER");
    });

    it("needs a partner: no target, yourself, or a stranger are all refused", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const opened = openPhase2Question(s, "THTH-40");
        expect(codeOf(() => declarePower(opened, a, "ASSIGN", { nowIso: NOW }))).toBe("INVALID_TARGET");
        expect(codeOf(() => declarePower(opened, a, "ASSIGN", { targetId: a, nowIso: NOW }))).toBe("INVALID_TARGET");
        expect(codeOf(() => declarePower(opened, a, "ASSIGN", { targetId: "stranger", nowIso: NOW }))).toBe("INVALID_TARGET");
    });

    it("opens the duel immediately: stage buzz, the partner recorded, the clock started", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        const after = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });

        expect(after.open?.power).toBe("ASSIGN");
        expect(after.open?.assignedTo).toBe(b);
        expect(after.open?.stage).toBe("buzz");
        expect(after.buzzOpenedAt).toBe(NOW);
        expect(after.players.find((p) => p.id === a)!.powersLeft).toEqual(["STAR"]);
    });

    it("the race runs on the QUESTION's clock, not the 5 s buzz window", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        // THTH-40 carries a 30 s limit in the fixture
        const after = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });
        expect(buzzWindowSeconds(after)).toBe(30);
        expect(isBuzzOpen(after, at(20))).toBe(true);
        expect(isBuzzOpen(after, at(31))).toBe(false);
    });

    it("only the two halves of the duel may buzz", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        const outsider = s.players[2].id;
        const after = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });

        expect(codeOf(() => buzz(after, outsider, at(1)))).toBe("NOT_YOUR_TURN");
        // the answerer may now buzz — the normal rule does not apply to a duel
        expect(codeOf(() => buzz(after, a, at(1)))).toBe("NO_ERROR");
        expect(codeOf(() => buzz(after, b, at(1)))).toBe("NO_ERROR");
    });

    it("the FIRST buzz locks the other half — a duel has one answerer, like any question", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        const racing = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });

        const afterA = buzz(racing, a, at(1));
        expect(afterA.open?.buzzer).toBe(a);
        // B is still inside the question's 30 s clock, and still not allowed in.
        expect(codeOf(() => buzz(afterA, b, at(2)))).toBe("ALREADY_OPEN");

        const afterB = buzz(racing, b, at(1));
        expect(afterB.open?.buzzer).toBe(b);
        expect(codeOf(() => buzz(afterB, a, at(2)))).toBe("ALREADY_OPEN");
    });

    it("A buzzes and is right: A +100%, B −50%", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        let after = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });
        after = buzz(after, a, at(2));
        after = resolveQuestion(after, { answerer: true, buzzer: true });

        expect(after.players.find((p) => p.id === a)!.score).toBe(40);
        expect(after.players.find((p) => p.id === b)!.score).toBe(-20);
        expect(after.open).toBeNull();
    });

    it("A buzzes and is wrong: A −50%, B nothing", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        let after = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });
        after = buzz(after, a, at(2));
        after = resolveQuestion(after, { answerer: false, buzzer: false });

        expect(after.players.find((p) => p.id === a)!.score).toBe(-20);
        expect(after.players.find((p) => p.id === b)!.score).toBe(0);
    });

    it("B buzzes and is right: B +100%, A −50% (the pairing follows the buzzer)", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        let after = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });
        after = buzz(after, b, at(2));
        after = resolveQuestion(after, { answerer: false, buzzer: true });

        expect(after.players.find((p) => p.id === a)!.score).toBe(-20);
        expect(after.players.find((p) => p.id === b)!.score).toBe(40);
    });

    it("nobody buzzes: both halves lose 50%", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        let after = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });
        after = resolveQuestion(after, { answerer: false });           // no buzzer verdict needed

        expect(after.players.find((p) => p.id === a)!.score).toBe(-20);
        expect(after.players.find((p) => p.id === b)!.score).toBe(-20);
    });

    it("the operator can END the race: the clock stops and BOTH halves are locked out", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        const racing = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });

        // Nothing has been buzzed yet, and the 30 s clock is still running…
        expect(isBuzzOpen(racing, at(1))).toBe(true);
        const locked = lockBuzzWindow(racing);

        // …the lock ends it anyway, for both halves, at any later time.
        expect(isBuzzOpen(locked, at(1))).toBe(false);
        expect(codeOf(() => buzz(locked, a, at(2)))).toBe("WINDOW_CLOSED");
        expect(codeOf(() => buzz(locked, b, at(2)))).toBe("WINDOW_CLOSED");
    });

    it("…and the question then resolves as the nobody-buzzed case: both −50%", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        const locked = lockBuzzWindow(
            declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW })
        );
        const after = resolveQuestion(locked, { answerer: false });

        expect(after.players.find((p) => p.id === a)!.score).toBe(-20);
        expect(after.players.find((p) => p.id === b)!.score).toBe(-20);
        expect(after.open).toBeNull();
    });

    it("the lock cannot be used to steal a settled race, and cannot fire with nothing open", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        const racing = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });

        expect(codeOf(() => lockBuzzWindow(buzz(racing, a, at(1))))).toBe("ALREADY_OPEN");
        expect(codeOf(() => lockBuzzWindow(createVeDich(POOL, [player("a", 0)])))).toBe("NOTHING_OPEN");
    });

    it("a fresh question starts unlocked", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const locked = lockBuzzWindow(closeCurrentAnswer(openPhase2Question(s, "THTH-40"), NOW));
        const nextTurn = advanceTurn(resolveQuestion(locked, { answerer: true }));
        // The lock belonged to that question, not to the round.
        expect(nextTurn.buzzLocked).toBe(false);
    });

    it("a buzz after the question's clock is refused", () => {
        const s = twoUp();
        const a = s.players[0].id;
        const b = s.players[1].id;
        const after = declarePower(openPhase2Question(s, "THTH-40"), a, "ASSIGN", { targetId: b, nowIso: NOW });
        expect(codeOf(() => buzz(after, b, at(31)))).toBe("WINDOW_CLOSED");
    });
});

describe("Phase 2 flow", () => {
    // Phase 2: lowest score plays first. Player "c" (score 10) starts.
    const players = [player("a", 40), player("b", 90), player("c", 10)];

    it("the current player picks exactly 3 distinct questions", () => {
        const state = beginPhase2(createVeDich(POOL, players));
        expect(codeOf(() => pickPhase2(state, "c", ["THTH-50", "THTH-40"]))).toBe("INVALID_QUESTION");
        expect(codeOf(() => pickPhase2(state, "c", ["THTH-50", "THTH-50", "THTH-40"]))).toBe("INVALID_QUESTION");
        expect(codeOf(() => pickPhase2(state, "c", ["THTH-50", "THTH-40", "THTH-30"]))).toBe("NO_ERROR");
    });

    it("the buzz window opens after the current answer, whatever its correctness", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        state = closeCurrentAnswer(state, NOW);
        expect(state.open?.stage).toBe("buzz");
    });

    it("the fastest buzzer answers; later buzzes are blocked", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW);
        state = buzz(state, "a", NOW);
        expect(state.open?.buzzer).toBe("a");
        expect(codeOf(() => buzz(state, "b", NOW))).toBe("ALREADY_OPEN");
    });

    it("the current player cannot buzz on their own question", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW);
        expect(codeOf(() => buzz(state, "c", NOW))).toBe("NOT_YOUR_TURN");
    });

    it("buzzing is impossible before the buzz window", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        expect(codeOf(() => buzz(state, "a", NOW))).toBe("ALREADY_OPEN");
    });

    it("the question cannot be resolved before the buzz window closes", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        expect(codeOf(() => resolveQuestion(state, { answerer: true }))).toBe("ALREADY_OPEN");
    });

    it("both correct: current and buzzer each get face value (+50 each)", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = buzz(closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW), "a", NOW);
        state = resolveQuestion(state, { answerer: true, buzzer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 + 50);
        expect(state.players.find((p) => p.id === "a")!.score).toBe(40 + 50);
    });

    it("current wrong, buzzer correct: current −25, buzzer +50", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = buzz(closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW), "a", NOW);
        state = resolveQuestion(state, { answerer: false, buzzer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 - 25);
        expect(state.players.find((p) => p.id === "a")!.score).toBe(40 + 50);
    });

    it("no buzz, current correct: scores once", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = resolveQuestion(closeCurrentAnswer(openPhase2Question(state, "THTH-50"), NOW), { answerer: true });
        expect(state.players.find((p) => p.id === "c")!.score).toBe(10 + 50);
    });

    it("a buzzer verdict is required when someone buzzed, and forbidden when nobody did", () => {
        let withBuzz = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        withBuzz = buzz(closeCurrentAnswer(openPhase2Question(withBuzz, "THTH-50"), NOW), "a", NOW);
        expect(codeOf(() => resolveQuestion(withBuzz, { answerer: true }))).toBe("NOT_YOUR_TURN");

        let noBuzz = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        noBuzz = closeCurrentAnswer(openPhase2Question(noBuzz, "THTH-50"), NOW);
        expect(codeOf(() => resolveQuestion(noBuzz, { answerer: true, buzzer: true }))).toBe("NOT_YOUR_TURN");
    });

    it("the buzzer's power is not allowed: buzzers never declare powers", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
        state = openPhase2Question(state, "THTH-50");
        state = closeCurrentAnswer(state, NOW);
        state = buzz(state, "a", NOW);
        // Only the current player may declare, so a buzzer is rejected as NOT_YOUR_TURN.
        expect(codeOf(() => declarePower(state, "a", "STAR"))).toBe("NOT_YOUR_TURN");
    });

    it("advanceTurn moves to the next player and clears the pending picks", () => {
        let state = pickPhase2(beginPhase2(createVeDich(POOL, players)), "c", ["THTH-50", "THTH-40", "THTH-30"]);
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
