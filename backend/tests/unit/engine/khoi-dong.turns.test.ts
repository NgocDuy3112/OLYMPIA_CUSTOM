import { describe, expect, it } from "vitest";
import {
    answerPhase1,
    buzzPhase2,
    closePhase2,
    isPhase2WindowOpen,
    judgePhase2,
    mayBuzzPhase2,
    nextPhase2Question,
    openPhase2Buzz,
    phase1Total,
    phase2Complete,
    phase2Points,
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
        s = answerPhase1(s, { correct: true, spentS: 20 });  // would total 50
        expect(s.ended).toBe(true);
        expect(phase1Total(s)).toBe(10);                     // only the first answer counts
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

describe("khoi-dong phase 2 — the buzz race", () => {
    const SET = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
    const open = (state = startPhase2(SET), now = T0) => openPhase2Buzz(state, now);

    it("is TWELVE questions, and refuses anything else", () => {
        expect(codeOf(() => startPhase2(["x"]))).toBe("VALIDATION");
        expect(codeOf(() => startPhase2(SET.slice(0, 6)))).toBe("VALIDATION");
        expect(startPhase2(SET).questionIds).toHaveLength(12);
    });

    it("nobody may buzz before the operator opens a window", () => {
        const s = startPhase2(SET);
        expect(mayBuzzPhase2(s, "a")).toBe(false);
        expect(codeOf(() => buzzPhase2(s, "a", T0))).toBe("NOTHING_OPEN");
    });

    it("the fastest buzz wins and everyone else is blocked", () => {
        const s = open();
        expect(isPhase2WindowOpen(s, at(1))).toBe(true);
        const buzzed = buzzPhase2(s, "a", at(1));
        expect(buzzed.current?.buzzer).toBe("a");
        expect(codeOf(() => buzzPhase2(buzzed, "b", at(2)))).toBe("ALREADY_OPEN");
        expect(mayBuzzPhase2(buzzed, "b")).toBe(false);
    });

    it("keeps the winning buzz's time", () => {
        const buzzed = buzzPhase2(open(), "a", at(1.24));
        expect(buzzed.current?.buzzerMs).toBe(1240);
    });

    it("a fresh window forgets the previous time", () => {
        let s = judgePhase2(buzzPhase2(open(), "a", at(1)), false);
        expect(s.current?.buzzerMs).toBeNull();
        s = openPhase2Buzz(s, at(10));
        expect(s.current?.buzzerMs).toBeNull();
    });

    it("the window is exactly five seconds", () => {
        const s = open();
        expect(isPhase2WindowOpen(s, at(5))).toBe(true);
        expect(isPhase2WindowOpen(s, at(5.001))).toBe(false);
        expect(codeOf(() => buzzPhase2(s, "a", at(6)))).toBe("WINDOW_CLOSED");
    });

    it("correct on the first window: +10, and the question is done", () => {
        const s = judgePhase2(buzzPhase2(open(), "a", at(1)), true);
        expect(phase2Points(s, "a")).toBe(10);
        expect(s.current).toBeNull();
        expect(s.index).toBe(1);
    });

    it("wrong on the first window: the answerer is locked out and a re-buzz is armed", () => {
        const s = judgePhase2(buzzPhase2(open(), "a", at(1)), false);
        expect(s.current?.attempt).toBe(2);
        expect(s.current?.excluded).toEqual(["a"]);
        expect(s.current?.openedAt).toBeNull();          // the console opens window 2
        expect(mayBuzzPhase2(s, "a")).toBe(false);
        expect(mayBuzzPhase2(s, "b")).toBe(false);       // no window yet
    });

    it("the re-buzz admits everyone but the first answerer, and pays 5", () => {
        let s = judgePhase2(buzzPhase2(open(), "a", at(1)), false);
        s = openPhase2Buzz(s, at(10));
        expect(mayBuzzPhase2(s, "a")).toBe(false);
        expect(codeOf(() => buzzPhase2(s, "a", at(11)))).toBe("NOT_YOUR_TURN");

        s = buzzPhase2(s, "b", at(11));
        s = judgePhase2(s, true);
        expect(phase2Points(s, "b")).toBe(5);
        expect(phase2Points(s, "a")).toBe(0);
    });

    it("wrong twice: the question dies with no points, and the next one is armed", () => {
        let s = judgePhase2(buzzPhase2(open(), "a", at(1)), false);
        s = judgePhase2(buzzPhase2(openPhase2Buzz(s, at(10)), "b", at(11)), false);
        expect(phase2Points(s, "a")).toBe(0);
        expect(phase2Points(s, "b")).toBe(0);
        expect(s.current).toBeNull();
        expect(s.index).toBe(1);
    });

    it("nobody buzzing: the console moves on, nothing is scored", () => {
        const s = nextPhase2Question(open());
        expect(phase2Points(s, "a")).toBe(0);
        expect(s.index).toBe(1);
    });

    it("the phase completes when its twelve questions are played", () => {
        let s = startPhase2(SET);
        for (let i = 0; i < 12; i++) s = nextPhase2Question(openPhase2Buzz(s, T0));
        expect(phase2Complete(s)).toBe(true);
        expect(s.closed).toBe(true);
        expect(codeOf(() => openPhase2Buzz(s, T0))).toBe("PHASE_ENDED");
    });

    it("no buzzes after the phase is closed", () => {
        const s = closePhase2(open());
        expect(codeOf(() => buzzPhase2(s, "a", T0))).toBe("PHASE_ENDED");
    });
});
