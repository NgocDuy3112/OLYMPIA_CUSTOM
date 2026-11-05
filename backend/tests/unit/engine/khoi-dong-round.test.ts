import { describe, expect, it } from "vitest";
import {
    activePlayerId,
    activeQuestionId,
    beginPhase2,
    endKhoiDong,
    judgeCard,
    nextQuestion,
    openWindow,
    khoiDongPoints,
    phase1Complete,
    recordOral,
    startKhoiDong,
    timeOutRun
} from "../../../src/game/engine/turns/khoi-dong-round.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const OPENED = "2026-01-01T00:00:00.000Z";
const beginPhase2At = (state: Parameters<typeof beginPhase2>[0], ids: string[]) =>
    beginPhase2(state, ids);

const P1 = ["a1", "a2", "a3", "a4", "a5", "a6"];
// Chung is SIX questions now — the phase refuses any other count.
const P2 = Array.from({ length: 6 }, (_, i) => `b${i + 1}`);
const PLAYERS = ["p0", "p1"];

function codeOf(fn: () => unknown): string {
    try { fn(); } catch (e) {
        if (e instanceof RuleError) return e.code;
        throw e;
    }
    return "NO_ERROR";
}

// Finish the active player's run: answer all 6 correctly.
function finishRun(state: ReturnType<typeof startKhoiDong>) {
    let s = state;
    for (let i = 0; i < 6; i++) s = recordOral(s, { correct: true, spentS: 1 });
    return s;
}

describe("khoi-dong round — phase 1 is one run per player", () => {
    it("starts every player on their own run", () => {
        const s = startKhoiDong(PLAYERS, P1);
        expect(Object.keys(s.runs)).toEqual(PLAYERS);
        expect(s.runs.p0.questionIds).toEqual(P1);
        expect(activePlayerId(s)).toBe("p0");
        expect(activeQuestionId(s)).toBe("a1");
    });

    it("recording an answer only affects the active player's run", () => {
        const s = recordOral(startKhoiDong(PLAYERS, P1), { correct: true, spentS: 5 });
        expect(s.runs.p0.cursor).toBe(1);
        expect(s.runs.p1.cursor).toBe(0);
        expect(activePlayerId(s)).toBe("p0");
    });

    it("when the active run ends, the next player becomes active", () => {
        const s = finishRun(startKhoiDong(PLAYERS, P1));
        expect(activePlayerId(s)).toBe("p1");
        expect(phase1Complete(s)).toBe(false);
    });

    it("each player's run has its own 45 s budget", () => {
        let s = startKhoiDong(PLAYERS, P1);
        // p0 spends 40 s; p1's run is untouched.
        s = recordOral(s, { correct: true, spentS: 40 });
        expect(s.runs.p0.elapsedS).toBe(40);
        expect(s.runs.p1.elapsedS).toBe(0);
        expect(s.runs.p0.ended).toBe(false);
    });

    it("timing out a run ends it and moves to the next player", () => {
        const s = timeOutRun(startKhoiDong(PLAYERS, P1));
        expect(s.runs.p0.ended).toBe(true);
        expect(activePlayerId(s)).toBe("p1");
    });

    it("phase 1 completes once every run has ended", () => {
        const afterP0 = finishRun(startKhoiDong(PLAYERS, P1));
        const afterP1 = finishRun(afterP0);
        expect(phase1Complete(afterP1)).toBe(true);
        expect(afterP1.runs.p1.ended).toBe(true);
    });

    it("a player's phase-1 score is their own", () => {
        const s = finishRun(startKhoiDong(PLAYERS, P1));   // p0: 6 correct = 60
        expect(khoiDongPoints(s, "p0")).toBe(60);
        expect(khoiDongPoints(s, "p1")).toBe(0);
    });
});

describe("khoi-dong round — phase 2 begins only after phase 1", () => {
    it("may begin early ONLY while phase 1 recorded nothing (the skip rule)", () => {
        // Untouched → jumping straight to Chung is the confirmed console choice.
        expect(beginPhase2At(startKhoiDong(PLAYERS, P1), P2).stage).toBe("phase2");
    });

    it("cannot begin early once phase 1 recorded an answer", () => {
        const touched = recordOral(startKhoiDong(PLAYERS, P1), { correct: true, spentS: 5 });
        expect(codeOf(() => beginPhase2At(touched, P2))).toBe("PHASE1_INCOMPLETE");
    });

    it("begins once everyone has finished", () => {
        const done = finishRun(finishRun(startKhoiDong(PLAYERS, P1)));
        const s = beginPhase2At(done, P2);
        expect(s.stage).toBe("phase2");
        expect(s.phase2?.questionIds).toEqual(P2);
        expect(activePlayerId(s)).toBeNull();          // no phase-1 run is active any more
    });

    it("cannot begin twice", () => {
        const done = finishRun(finishRun(startKhoiDong(PLAYERS, P1)));
        const s = beginPhase2At(done, P2);
        expect(codeOf(() => beginPhase2At(s, P2))).toBe("WRONG_STAGE");
    });
});

describe("khoi-dong round — phase 2: the timed batch", () => {
    function inPhase2() {
        return beginPhase2At(finishRun(finishRun(startKhoiDong(PLAYERS, P1))), P2);
    }

    it("Bấm giờ opens the window; each correct player pays ten on top of their run", () => {
        let s = openWindow(inPhase2(), OPENED);
        expect(s.phase2?.openedAt).toBe(OPENED);

        s = judgeCard(s, "p0", true);
        s = judgeCard(s, "p1", true);
        expect(khoiDongPoints(s, "p0")).toBe(60 + 10);   // 60 from phase 1, +10 for the card
        expect(khoiDongPoints(s, "p1")).toBe(60 + 10);
        expect(s.phase2?.index).toBe(0);                 // marking never advances on its own
    });

    it("a wrong card pays nothing, and re-marking corrects the ledger", () => {
        let s = openWindow(inPhase2(), OPENED);
        s = judgeCard(s, "p0", false);
        expect(khoiDongPoints(s, "p0")).toBe(60);
        s = judgeCard(s, "p0", true);
        expect(khoiDongPoints(s, "p0")).toBe(70);
    });

    it("advancing moves the cursor and shuts the window with its question", () => {
        let s = openWindow(inPhase2(), OPENED);
        s = nextQuestion(s);
        expect(s.phase2?.index).toBe(1);
        expect(s.phase2?.openedAt).toBeNull();

        // question 2 waits for its OWN Bấm giờ — and may be opened again
        const reopened = openWindow(s, OPENED);
        expect(reopened.phase2?.index).toBe(1);
        expect(reopened.phase2?.openedAt).toBe(OPENED);
    });

    it("ending the round closes the phase — no window, no marks", () => {
        const s = endKhoiDong(inPhase2());
        expect(s.ended).toBe(true);
        expect(s.phase2?.closed).toBe(true);
        expect(codeOf(() => openWindow(s, OPENED))).toBe("ENDED");
        expect(codeOf(() => judgeCard(s, "p0", true))).toBe("ENDED");
    });
});
