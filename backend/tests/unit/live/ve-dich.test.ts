import { VE_DICH_DEFAULTS } from "../../../src/game/engine/rules.js";
import { describe, expect, it } from "vitest";
import { applyVeDichAction, type VeDichContext } from "../../../src/modules/live/ve-dich.js";
import {
    advanceTurn,
    beginPhase2,
    createVeDich,
    openPhase2Question,
    pickPhase1,
    pickPhase2,
    type PlayerState,
    type VeDichQuestion,
    type VeDichState
} from "../../../src/game/engine/turns/ve-dich.js";
import type { AnswerDraft } from "../../../src/modules/live/apply.js";
import { VeDichRuleError } from "../../../src/game/engine/turns/ve-dich.js";

const NOW = "2026-01-01T00:00:00.000Z";
const at = (s: number) => new Date(Date.parse(NOW) + s * 1000).toISOString();

// The show's board carries NO category labels — a cell IS its score; the
// ordinal tells the same-score cells apart ("40-1" … "40-4").
const cells = (value: number, count: number): VeDichQuestion[] =>
    Array.from({ length: count }, (_, i) => ({ id: `${value}-${i + 1}`, value, timeLimit: 30 }));
// The show's board — createVeDich refuses a set that is not 6×20/6×30/4×40/4×50.
const POOL = [
    ...cells(20, 6), ...cells(30, 6), ...cells(40, 4), ...cells(50, 4)
];
const PLAYERS = ["p0", "p1", "p2"];

const ctx = (over: Partial<VeDichContext> = {}): VeDichContext => ({
    actorId: "console-1", rules: VE_DICH_DEFAULTS, roundId: "ve-dich", now: NOW,
    questions: POOL, players: PLAYERS.map((id) => ({ id, score: 0 })), drafts: [],
    ...over
});

const started = (scores: number[] = [0, 0, 0]): VeDichState =>
    applyVeDichAction(createVeDich(POOL, []), { kind: "ve-dich.start" }, ctx({
        players: PLAYERS.map((id, i) => ({ id, score: scores[i] }))
    })).state;

const draft = (userId: string): AnswerDraft =>
    ({ userId, suggestion: "CORRECT", answeredMs: 1_000, judged: false });

function phase1Done(): VeDichState {
    let s = started();
    for (let i = 0; i < PLAYERS.length; i++) s = advanceTurn(s);
    return s;
}

function phase2Open(playerId: string, questionId: string): VeDichState {
    let s = beginPhase2(phase1Done());
    // The batch must contain the question this test opens — the pool is
    // partitioned now (Chung leftovers + deferred 40/50), so slice(0,3)
    // alone no longer guarantees the target.
    const target = s.remaining.find((q) => q.id === questionId);
    const others = s.remaining.filter((q) => q.id !== questionId).slice(0, 2);
    const ids = (target ? [target, ...others] : s.remaining.slice(0, 3)).map((q) => q.id);
    s = pickPhase2(s, playerId, ids);
    return openPhase2Question(s, questionId);
}

describe("ve-dich start", () => {
    it("creates the round with both powers and the cumulative score as the seed", () => {
        const s = started([10, 50, 0]);
        expect(s.players.map((p) => p.id)).toEqual(["p1", "p0", "p2"]);   // highest first
        expect(s.players[0].score).toBe(50);
        expect(s.players.every((p) => p.powersLeft.length === 2)).toBe(true);
        expect(s.phase).toBe(1);
        expect(s.ended).toBe(false);
    });

    it("start with phase: 2 skips the untouched phase 1 — the summit runs on current scores", () => {
        const s = applyVeDichAction(createVeDich(POOL, []), { kind: "ve-dich.start", phase: 2 }, ctx({
            players: PLAYERS.map((id, i) => ({ id, score: [10, 50, 0][i] }))
        })).state;
        expect(s.phase).toBe(2);
        expect(s.turnIndex).toBe(0);
        expect(s.open).toBeNull();
        // phase 2's rule: lowest score first, from the scores as they stand
        expect(s.players.map((p) => p.id)).toEqual(["p2", "p0", "p1"]);
    });

});

describe("ve-dich picks", () => {
    it("a phase-1 pick records a PICK event and opens the question", () => {
        const s = started();
        const res = applyVeDichAction(s, { kind: "ve-dich.pick", playerId: "p0", questionId: "30-1" }, ctx());
        expect(res.state.open?.question.id).toBe("30-1");
        expect(res.facts[0]).toMatchObject({
            type: "event", questionId: "30-1", userId: "p0", kind: "PICK",
            payload: { kind: "PICK", turnId: "phase-1", pickOrder: 1 }
        });
    });

    it("a phase-2 batch records one PICK event per question", () => {
        const s = beginPhase2(phase1Done());
        const ids = s.remaining.slice(0, 3).map((q) => q.id);
        const res = applyVeDichAction(s, {
            kind: "ve-dich.pickBatch", playerId: s.players[0].id, questionIds: ids
        }, ctx());
        expect(res.facts).toHaveLength(3);
        expect((res.facts[0] as { payload: { turnId: string } }).payload.turnId).toBe("phase-2");
    });

    it("picking out of turn is rejected", () => {
        const s = started();
        expect(() => applyVeDichAction(s, { kind: "ve-dich.pick", playerId: "p2", questionId: "50-1" }, ctx()))
            .toThrow(VeDichRuleError);
    });
});

describe("ve-dich powers and buzz", () => {
    it("declaring AFTER the open is refused — the row lives on the pick board", () => {
        const s = phase2Open("p0", "50-1");
        expect(() => applyVeDichAction(s, {
            kind: "ve-dich.declarePower", playerId: "p0", power: "STAR"
        }, ctx())).toThrow(VeDichRuleError);
    });

    it("a PRE-OPEN choice is staged only — the POWER event lands at the open", () => {
        let s = beginPhase2(phase1Done());
        s = pickPhase2(s, s.players[0].id, ["40-1", "50-1", "30-1"]);

        const staged = applyVeDichAction(s, {
            kind: "ve-dich.declarePower", playerId: s.players[0].id, power: "STAR"
        }, ctx());
        expect(staged.facts).toEqual([]);                       // nothing spent, nothing recorded
        expect(staged.state.stagedPower).toEqual({ power: "STAR" });

        const opened = applyVeDichAction(staged.state, {
            kind: "ve-dich.openQuestion", questionId: "40-1"
        }, ctx());
        expect(opened.state.open?.power).toBe("STAR");
        expect(opened.facts[0]).toMatchObject({
            type: "event", kind: "POWER", payload: { kind: "POWER", power: "STAR" }
        });
    });

    it("\"Không dùng quyền năng\" (power: null) IS the turn's pick — one press, no fact", () => {
        let s = beginPhase2(phase1Done());
        s = pickPhase2(s, s.players[0].id, ["40-1", "50-1", "30-1"]);

        const none = applyVeDichAction(s, {
            kind: "ve-dich.declarePower", playerId: s.players[0].id, power: null
        }, ctx());
        expect(none.state.stagedPower ?? null).toBeNull();
        expect(none.state.turnPowerUsed).toBe(true);          // the pick is MADE
        expect(none.facts).toEqual([]);

        // one press per turn — the next one is refused, whatever it says
        expect(() => applyVeDichAction(none.state, {
            kind: "ve-dich.declarePower", playerId: s.players[0].id, power: "STAR"
        }, ctx())).toThrow(VeDichRuleError);
    });

    it("a buzz records how long it took, measured from the window opening", () => {
        let s = phase2Open("p0", "50-1");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx({ now: at(0) })).state;
        const res = applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx({ now: at(1.5) }));
        expect(res.facts[0]).toMatchObject({
            type: "event", userId: "p1", kind: "BUZZ", payload: { kind: "BUZZ", buzzMs: 1500, won: true }
        });
        expect(res.state.open?.buzzer).toBe("p1");
    });

    it("a buzz AFTER the window is refused — the clock is a rule, not a UI courtesy", () => {
        // The window opened at t0 and is 5 s wide (VE_DICH_DEFAULTS.buzzWindowS).
        let s = phase2Open("p0", "50-1");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx({ now: at(0) })).state;

        // Inside the window: accepted.
        expect(() => applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx({ now: at(4.9) })))
            .not.toThrow();

        // One tick past it: refused, so a slow player cannot steal the question by
        // posting late (hiding the button is not enforcement).
        expect(() => applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx({ now: at(5.1) })))
            .toThrow(VeDichRuleError);
        try {
            applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx({ now: at(5.1) }));
        } catch (e) {
            expect((e as VeDichRuleError).detail.code).toBe("WINDOW_CLOSED");
        }
    });

    it("a second buzz is rejected by the engine", () => {
        let s = phase2Open("p0", "50-1");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx()).state;
        s = applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx()).state;
        expect(() => applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p2" }, ctx())).toThrow(VeDichRuleError);
    });
});

describe("ve-dich resolve", () => {
    it("phase 1, typed: finalizes the player's draft and scores by face value", () => {
        let s = started();
        s = pickPhase1(s, "p0", "30-1");   // Chung's table: only 20/30s
        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: true },
            ctx({ drafts: [draft("p0")] }));
        expect(res.facts[0]).toEqual({
            type: "judge", questionId: "30-1", userId: "p0", verdict: "CORRECT", pointsAwarded: 30
        });
        expect(res.state.players.find((p) => p.id === "p0")!.score).toBe(30);
    });

    it("phase 1 is power-free: a wrong answer is the plain −50%", () => {
        let s = started();
        s = pickPhase1(s, "p0", "30-1");
        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: false }, ctx({ drafts: [draft("p0")] }));
        expect(res.facts[0]).toMatchObject({ type: "judge", pointsAwarded: -15 });
    });

    it("phase 1, never submitted: the verdict still scores, as an operator row", () => {
        let s = started();
        s = pickPhase1(s, "p0", "30-1");
        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: false }, ctx({ drafts: [] }));
        expect(res.facts[0]).toMatchObject({
            type: "answer", userId: "p0", value: { oral: true }, verdict: "INCORRECT", pointsAwarded: -15
        });
    });

    it("phase 2: the answerer and the buzzer are scored independently", () => {
        let s = phase2Open("p0", "50-1");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx()).state;
        s = applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx()).state;

        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: false, buzzer: true }, ctx());
        expect(res.facts).toHaveLength(2);
        expect(res.facts[0]).toMatchObject({ userId: "p0", verdict: "INCORRECT", pointsAwarded: -25 });
        expect(res.facts[1]).toMatchObject({ userId: "p1", verdict: "CORRECT", pointsAwarded: 50 });
    });

    it("phase 2 with no buzz: only the answerer scores", () => {
        let s = phase2Open("p0", "40-1");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx()).state;
        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: true }, ctx());
        expect(res.facts).toHaveLength(1);
        expect(res.facts[0]).toMatchObject({ userId: "p0", pointsAwarded: 40 });
    });
});

describe("ve-dich flow actions", () => {
    it("advanceTurn moves the cursor", () => {
        const res = applyVeDichAction(started(), { kind: "ve-dich.advanceTurn" }, ctx());
        expect(res.state.turnIndex).toBe(1);
    });

    it("beginPhase2 reorders and the round can be ended", () => {
        const phase2 = applyVeDichAction(phase1Done(), { kind: "ve-dich.beginPhase2" }, ctx());
        expect(phase2.state.phase).toBe(2);

        const ended = applyVeDichAction(phase2.state, { kind: "ve-dich.endRound" }, ctx());
        expect(ended.state.ended).toBe(true);
    });

    it("beginPhase2 is rejected while phase 1 has unfinished turns", () => {
        // Untouched may now skip (the confirmed rule) — one completed turn may not.
        let s = started();
        s = advanceTurn(s);
        expect(() => applyVeDichAction(s, { kind: "ve-dich.beginPhase2" }, ctx())).toThrow(VeDichRuleError);
    });
});
