import { KHOI_DONG_DEFAULTS } from "../../../src/game/engine/rules.js";
import { describe, expect, it } from "vitest";
import { applyKhoiDongAction, type KhoiDongContext } from "../../../src/modules/live/khoi-dong.js";
import { khoiDongPoints, type KhoiDongState } from "../../../src/game/engine/turns/khoi-dong-round.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const P1 = ["a1", "a2", "a3", "a4", "a5", "a6"];
// Chung stages SIX questions; the engine refuses any other count.
const P2 = Array.from({ length: 6 }, (_, i) => `b${i + 1}`);
const NOW = "2026-01-01T00:00:00.000Z";

const ctx = (over: Partial<KhoiDongContext> = {}): KhoiDongContext => ({
    actorId: "console-1", rules: KHOI_DONG_DEFAULTS, roundId: "khoi-dong", now: NOW,
    playerIds: ["p0", "p1"], phase1QuestionIds: P1, phase2QuestionIds: P2,
    answerDrafts: [],
    ...over
});

/** A submitted card awaiting the console's verdict (the ledger's own shape). */
const draft = (userId: string, judged = false) =>
    ({ userId, suggestion: "CORRECT" as const, answeredMs: 900, judged });

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

    it("cannot begin once phase 1 HAS answers but is unfinished — only an untouched phase skips", () => {
        // One recorded oral answer = touched: PHASE1_INCOMPLETE keeps guarding
        // (the skip rule costs phase 1 only while it recorded NOTHING).
        let s = started();
        s = applyKhoiDongAction(s, { kind: "khoi-dong.recordOral", correct: true, spentS: 1 }, ctx()).state;
        expect(() => applyKhoiDongAction(s, { kind: "khoi-dong.beginPhase2" }, ctx()))
            .toThrow(RuleError);
    });

    it("start with phase: 2 skips the untouched oral phase and opens Chung", () => {
        const s = applyKhoiDongAction({} as KhoiDongState, { kind: "khoi-dong.start", phase: 2 }, ctx()).state;
        expect(s.stage).toBe("phase2");
        expect(s.ended).toBe(false);
        // no oral results carried over — phase 1 scored nothing
        expect(Object.values(s.runs).every((r) => Object.keys(r.results).length === 0)).toBe(true);
    });

    it("beginPhase2 opens the six-question batch, waiting for its first Bấm giờ", () => {
        const s = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        expect(s.stage).toBe("phase2");
        expect(s.phase2?.questionIds).toEqual(P2);
        expect(s.phase2?.openedAt).toBeNull();            // nothing runs until Bấm giờ
    });

    it("startWindow opens the window for the question in play — once", () => {
        const base = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        const res = applyKhoiDongAction(base, { kind: "khoi-dong.startWindow" }, ctx());
        expect(res.state.phase2?.openedAt).toBe(NOW);
        expect(res.facts).toEqual([]);

        // a second press while the clock runs is refused
        expect(() => applyKhoiDongAction(res.state, { kind: "khoi-dong.startWindow" }, ctx())).toThrow(RuleError);
    });

    it("judging a submitted card pays 10 and writes a judge fact", () => {
        const base = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        const res = applyKhoiDongAction(
            base,
            { kind: "khoi-dong.judge", playerId: "p0", correct: true },
            ctx({ answerDrafts: [draft("p0")] })
        );
        expect(khoiDongPoints(res.state, "p0")).toBe(60 + 10);     // 60 from the oral runs
        expect(res.facts).toEqual([{
            type: "judge", questionId: P2[0], userId: "p0", verdict: "CORRECT", pointsAwarded: 10
        }]);
    });

    it("a wrong card pays nothing and writes a zero-point fact", () => {
        const base = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        const res = applyKhoiDongAction(
            base,
            { kind: "khoi-dong.judge", playerId: "p0", correct: false },
            ctx({ answerDrafts: [draft("p0")] })
        );
        expect(khoiDongPoints(res.state, "p0")).toBe(60);
        expect(res.facts[0]).toMatchObject({ type: "judge", verdict: "INCORRECT", pointsAwarded: 0 });
    });

    it("marking a player who submitted nothing is refused", () => {
        const base = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        expect(() => applyKhoiDongAction(
            base,
            { kind: "khoi-dong.judge", playerId: "p1", correct: true },
            ctx({ answerDrafts: [draft("p0")] })
        )).toThrow(RuleError);
    });

    it("re-marking corrects the ledger instead of paying twice", () => {
        const base = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        const right = applyKhoiDongAction(
            base, { kind: "khoi-dong.judge", playerId: "p0", correct: true },
            ctx({ answerDrafts: [draft("p0")] })
        ).state;
        const fixed = applyKhoiDongAction(
            right, { kind: "khoi-dong.judge", playerId: "p0", correct: false },
            ctx({ answerDrafts: [draft("p0", true)] })
        ).state;
        expect(khoiDongPoints(fixed, "p0")).toBe(60);
    });

    it("advancing waits for every submitted card to be judged", () => {
        const opened = applyKhoiDongAction(
            applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state,
            { kind: "khoi-dong.startWindow" }, ctx()
        ).state;

        // a card still waiting → the strip may not move
        expect(() => applyKhoiDongAction(
            opened, { kind: "khoi-dong.nextQuestion" },
            ctx({ answerDrafts: [draft("p0")] })
        )).toThrow(RuleError);

        // every card judged → question 2, and its window waits for its own Bấm giờ
        const next = applyKhoiDongAction(
            opened, { kind: "khoi-dong.nextQuestion" },
            ctx({ answerDrafts: [draft("p0", true)] })
        );
        expect(next.state.phase2?.index).toBe(1);
        expect(next.state.phase2?.openedAt).toBeNull();
    });

    it("endRound ends the round and closes the batch", () => {
        const s = applyKhoiDongAction(finishedPhase1(), { kind: "khoi-dong.beginPhase2" }, ctx()).state;
        const res = applyKhoiDongAction(s, { kind: "khoi-dong.endRound" }, ctx());
        expect(res.state.ended).toBe(true);
        expect(res.state.phase2?.closed).toBe(true);
    });
});
