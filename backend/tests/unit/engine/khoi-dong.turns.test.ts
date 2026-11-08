import { describe, expect, it } from "vitest";
import {
    answerPhase1,
    closePhase2,
    isPhase2WindowOpen,
    judgePhase2Card,
    nextPhase2,
    openPhase2Window,
    phase1Total,
    phase2Complete,
    phase2Points,
    phase2QuestionId,
    startPhase1,
    startPhase2,
    timeOutPhase1
} from "../../../src/game/engine/turns/khoi-dong.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const IDS6 = ["q1", "q2", "q3", "q4", "q5", "q6"];

function codeOf(fn: () => unknown): string {
    try { fn(); } catch (e) {
        if (e instanceof RuleError) return e.code;
        throw e;
    }
    return "NO_ERROR";
}

describe("khoi-dong phase 1 (oral, sequential, 45 s)", () => {
    it("requires exactly 6 questions", () => {
        expect(codeOf(() => startPhase1(["a", "b"]))).toBe("VALIDATION");
    });

    it("6 correct answers within the budget: 60 points", () => {
        let s = startPhase1(IDS6);
        for (let i = 0; i < 6; i++) s = answerPhase1(s, { correct: true, spentS: 5 });
        expect(s.ended).toBe(true);
        expect(phase1Total(s)).toBe(60);
    });

    it("wrong answers score 0 but still use the clock and move on", () => {
        let s = startPhase1(IDS6);
        s = answerPhase1(s, { correct: true, spentS: 5 });
        s = answerPhase1(s, { correct: false, spentS: 5 });
        expect(s.cursor).toBe(2);
        expect(phase1Total(s)).toBe(10);
    });

    it("the 45 s budget is shared across the whole phase", () => {
        let s = startPhase1(IDS6);
        s = answerPhase1(s, { correct: true, spentS: 20 });
        s = answerPhase1(s, { correct: true, spentS: 20 });
        expect(s.elapsedS).toBe(40);
        expect(s.ended).toBe(false);
    });

    it("an answer that runs past 45 s is not counted and ends the phase", () => {
        let s = startPhase1(IDS6);
        s = answerPhase1(s, { correct: true, spentS: 30 });
        s = answerPhase1(s, { correct: true, spentS: 20 });  
        expect(s.ended).toBe(true);
        expect(phase1Total(s)).toBe(10);                     
    });

    it("timing out between questions ends the phase; unasked questions score 0", () => {
        let s = startPhase1(IDS6);
        s = answerPhase1(s, { correct: true, spentS: 5 });
        s = timeOutPhase1(s);
        expect(s.ended).toBe(true);
        expect(phase1Total(s)).toBe(10);
    });

    it("cannot answer after the phase has ended", () => {
        let s = timeOutPhase1(startPhase1(IDS6));
        expect(codeOf(() => answerPhase1(s, { correct: true, spentS: 1 }))).toBe("PHASE_ENDED");
    });
});

const T0 = "2026-01-01T00:00:00.000Z";
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();

describe("khoi-dong phase 2 — the timed batch", () => {
    const SET = IDS6;                                  
    const open = (state = startPhase2(SET), now = T0) => openPhase2Window(state, now);

    it("is SIX questions, and refuses anything else", () => {
        expect(codeOf(() => startPhase2(["x"]))).toBe("VALIDATION");
        expect(codeOf(() => startPhase2(SET.slice(0, 3)))).toBe("VALIDATION");
        expect(startPhase2(SET).questionIds).toHaveLength(6);
    });

    it("nothing runs before Bấm giờ: the question waits, window shut", () => {
        const s = startPhase2(SET);
        expect(s.openedAt).toBeNull();
        expect(isPhase2WindowOpen(s, T0)).toBe(false);
        expect(phase2QuestionId(s)).toBe("q1");
    });

    it("Bấm giờ opens the window for the question in play — once", () => {
        const s = open();
        expect(s.openedAt).toBe(T0);
        expect(isPhase2WindowOpen(s, at(1))).toBe(true);
        expect(codeOf(() => openPhase2Window(s, at(1)))).toBe("ALREADY_OPEN");
    });

    it("the window is exactly ten seconds — at zero the input locks", () => {
        const s = open();
        expect(isPhase2WindowOpen(s, at(10))).toBe(true);
        expect(isPhase2WindowOpen(s, at(10.001))).toBe(false);
    });

    it("after the clock runs out the console may give the field another window", () => {
        let s = open();
        s = openPhase2Window(s, at(12));
        expect(s.openedAt).toBe(at(12));
        expect(isPhase2WindowOpen(s, at(15))).toBe(true);
    });

    it("each correct player pays ten, independently — wrong pays nothing", () => {
        let s = open();
        s = judgePhase2Card(s, "a", true);
        s = judgePhase2Card(s, "b", true);
        s = judgePhase2Card(s, "c", false);
        expect(phase2Points(s, "a")).toBe(10);
        expect(phase2Points(s, "b")).toBe(10);
        expect(phase2Points(s, "c")).toBe(0);
    });

    it("re-marking a card CORRECTS it instead of paying twice", () => {
        let s = open();
        s = judgePhase2Card(s, "a", true);
        s = judgePhase2Card(s, "a", false);
        expect(phase2Points(s, "a")).toBe(0);
        s = judgePhase2Card(s, "a", true);
        expect(phase2Points(s, "a")).toBe(10);
    });

    it("judging before any question is in play is refused", () => {
        const done = closePhase2(startPhase2(SET));
        expect(codeOf(() => judgePhase2Card(done, "a", true))).toBe("PHASE_ENDED");
    });

    it("advancing moves the cursor and kills the window with its question", () => {
        let s = open();
        s = nextPhase2(s);
        expect(s.index).toBe(1);
        expect(s.openedAt).toBeNull();
        expect(phase2QuestionId(s)).toBe("q2");
        expect(isPhase2WindowOpen(s, at(11))).toBe(false);
    });

    it("advancing past the last question completes the phase", () => {
        let s = startPhase2(SET);
        for (let i = 0; i < 6; i++) s = nextPhase2(s);
        expect(phase2Complete(s)).toBe(true);
        expect(s.closed).toBe(true);
        expect(phase2QuestionId(s)).toBeNull();
        expect(codeOf(() => openPhase2Window(s, T0))).toBe("PHASE_ENDED");
        expect(codeOf(() => judgePhase2Card(s, "a", true))).toBe("PHASE_ENDED");
        expect(codeOf(() => nextPhase2(s))).toBe("PHASE_ENDED");
    });

    it("closing the phase ends it", () => {
        const s = closePhase2(open());
        expect(phase2Complete(s)).toBe(true);
        expect(codeOf(() => nextPhase2(s))).toBe("PHASE_ENDED");
    });
});
