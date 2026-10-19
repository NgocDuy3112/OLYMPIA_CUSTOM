import { describe, expect, it } from "vitest";
import { applyKhoiDongAction, type KhoiDongContext } from "../../../src/modules/live/khoi-dong.js";
import { khoiDongPoints, type KhoiDongState } from "../../../src/game/engine/turns/khoi-dong-round.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const P1 = ["a1", "a2", "a3", "a4", "a5", "a6"];
const P2 = ["b1", "b2", "b3", "b4", "b5", "b6"];
const NOW = "2026-01-01T00:00:00.000Z";

const ctx = (over: Partial<KhoiDongContext> = {}): KhoiDongContext => ({
    actorId: "mc-1", roundId: "khoi-dong", now: NOW,
    playerIds: ["p0", "p1"], phase1QuestionIds: P1, phase2QuestionIds: P2,
    ...over
});

const started = (): KhoiDongState =>
    applyKhoiDongAction({} as KhoiDongState, { kind: "khoi-dong.start" }, ctx()).state;

describe("applyKhoiDongAction — phase 1", () => {
    it("start creates a run for every seated player", () => {
        const s = started();
        expect(Object.keys(s.runs)).toEqual(["p0", "p1"]);
        expect(s.runs.p0.questionIds).toEqual(P1);
        expect(s.activeIndex).toBe(0);
    });

    it("recording an oral answer writes a fact with the awarded points", () => {
        const res = applyKhoiDongAction(started(), {
            kind: "khoi-dong.recordOral", correct: true, spentS: 4
        }, ctx());
        expect(res.facts).toHaveLength(1);
        expect(res.facts[0]).toMatchObject({
            type: "answer", questionId: "a1", userId: "p0",
            value: { oral: true },              // oral: no typed content
            verdict: "CORRECT", pointsAwarded: 10, autoMatched: false
        });
    });

    it("a wrong oral answer writes a fact with 0 points", () => {
        const res = applyKhoiDongAction(started(), {
            kind: "khoi-dong.recordOral", correct: false, spentS: 4
        }, ctx());
        expect(res.facts[0]).toMatchObject({ verdict: "INCORRECT", pointsAwarded: 0 });
    });

    it("an answer that overruns the 45 s budget is not counted and writes no fact", () => {
        const res = applyKhoiDongAction(started(), {
            kind: "khoi-dong.recordOral", correct: true, spentS: 50
        }, ctx());
        expect(res.facts).toEqual([]);
        expect(res.state.runs.p0.ended).toBe(true);
        expect(khoiDongPoints(res.state, "p0")).toBe(0);
    });

    it("times out a run without a fact", () => {
        const res = applyKhoiDongAction(started(), { kind: "khoi-dong.timeOutRun" }, ctx());
        expect(res.facts).toEqual([]);
        expect(res.state.runs.p0.ended).toBe(true);
    });
});

describe("applyKhoiDongAction — phase 2", () => {
    function finishedPhase1(): KhoiDongState {
        let s = started();
        for (let i = 0; i < 6; i++) s = applyKhoiDongAction(s, { kind: "khoi-dong.recordOral", correct: true, spentS: 1 }, ctx()).state;
        s = applyKhoiDongAction(s, { kind: "khoi-dong.timeOutRun" }, ctx()).state;   // finish p1's run
        return s;
    }

    it("cannot begin before phase 1 is complete", () => {
        expect(() => applyKhoiDongAction(started(), { kind: "khoi-dong.beginPhase2" }, ctx()))
            .toThrow(RuleError);
    });

    it("beginPhase2 opens the typed phase and stamps the clock", () => {
        const s = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        expect(s.stage).toBe("phase2");
        expect(s.phase2OpenedAt).toBe(NOW);
        expect(s.phase2?.questionIds).toEqual(P2);
    });

    it("a typed answer writes an auto-matched fact worth 10", () => {
        const s = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        const res = applyKhoiDongAction(s, {
            kind: "khoi-dong.recordTyped", playerId: "p0", questionId: "b1", correct: true, text: "hanoi", atS: 5
        }, ctx());
        expect(res.facts[0]).toMatchObject({
            type: "answer", questionId: "b1", userId: "p0",
            value: { text: "hanoi" }, verdict: "CORRECT", pointsAwarded: 10, autoMatched: true
        });
    });

    it("endRound ends the round and closes the window", () => {
        const s = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        const res = applyKhoiDongAction(s, { kind: "khoi-dong.endRound" }, ctx());
        expect(res.state.ended).toBe(true);
        expect(res.state.phase2?.closed).toBe(true);
    });
});
