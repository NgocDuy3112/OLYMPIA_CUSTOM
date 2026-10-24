import { describe, expect, it } from "vitest";
import { buildPlayerView, type SubmittedAnswer } from "../../../src/modules/live/view.js";
import { openHint, startGiaiMa } from "../../../src/game/engine/turns/giai-ma.js";
import { openCurrentQuestion, startButPha, submitAnswer } from "../../../src/game/engine/turns/but-pha.js";
import { startKhoiDong } from "../../../src/game/engine/turns/khoi-dong-round.js";
import {
    advanceTurn,
    beginPhase2 as beginVeDichPhase2,
    closeCurrentAnswer,
    createVeDich,
    openPhase2Question,
    pickPhase2,
    type PlayerState,
    type VeDichQuestion
} from "../../../src/game/engine/turns/ve-dich.js";
import { beginPhase2, finishSetup } from "./helpers.js";
import type { MatchQuestion } from "../../../src/game/contracts/index.js";

const NOW = "2026-01-01T00:00:00.000Z";
const at = (s: number) => new Date(Date.parse(NOW) + s * 1000).toISOString();

const base = (over: Partial<Parameters<typeof buildPlayerView>[0]>) => ({
    matchId: "m1", roundId: "x", version: 3, now: NOW, userId: "p0",
    state: {}, submitted: [] as SubmittedAnswer[], ...over
});

describe("player view — giai-ma", () => {
    const H = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];
    const state = openHint(startGiaiMa(["p0", "p1"], H), "h2", NOW);

    it("shows the open hint and its 15 s deadline", () => {
        const view = buildPlayerView(base({ roundId: "giai-ma", state }));
        expect(view.open).toEqual([{ questionId: "h2", deadlineAt: at(15), question: null }]);
    });

    it("closes the window when 15 s have passed", () => {
        const view = buildPlayerView(base({ roundId: "giai-ma", state, now: at(20) }));
        expect(view.open).toEqual([]);
    });

    it("reports this player's own keyword value and revealed hints", () => {
        const advanced = {
            ...state,
            players: state.players.map((p) =>
                p.id === "p0" ? { ...p, hintsRevealed: 3, revealed: ["h1", "h2", "h3"] } : p
            )
        };
        const view = buildPlayerView(base({ roundId: "giai-ma", state: advanced }));
        expect(view.me).toMatchObject({
            keywordValue: 70,
            hintsRevealed: 3,
            revealedHints: [
                { questionId: "h1", question: null },
                { questionId: "h2", question: null },
                { questionId: "h3", question: null }
            ]
        });
    });

    it("reports whether the player has already answered the open hint", () => {
        const view = buildPlayerView(base({
            roundId: "giai-ma", state, submitted: [{ questionId: "h2", judged: true }]
        }));
        expect(view.me.answerState).toBe("final");
    });

    it("hides another player's revealed hints", () => {
        const view = buildPlayerView(base({ roundId: "giai-ma", state, userId: "p1" }));
        expect(view.me.revealedHints).toEqual([]);
    });
});

describe("player view — but-pha", () => {
    const Q = ["q1", "q2", "q3", "q4"];

    it("shows the open question and its 30 s deadline once the clock runs", () => {
        const state = openCurrentQuestion(startButPha(Q), NOW);
        const view = buildPlayerView(base({ roundId: "but-pha", state }));
        expect(view.open).toEqual([{ questionId: "q1", deadlineAt: at(30), question: null }]);
    });

    it("closes the window after 30 s", () => {
        const state = openCurrentQuestion(startButPha(Q), NOW);
        const view = buildPlayerView(base({ roundId: "but-pha", state, now: at(31) }));
        expect(view.open).toEqual([]);
    });

    it("shows no open question before the clock starts", () => {
        const view = buildPlayerView(base({ roundId: "but-pha", state: startButPha(Q) }));
        expect(view.open).toEqual([]);
    });

    it("reports the player's own points and answer state", () => {
        const state = openCurrentQuestion(startButPha(Q), NOW);
        const view = buildPlayerView(base({
            roundId: "but-pha", state, submitted: [{ questionId: "q1", judged: false }]
        }));
        expect(view.me).toMatchObject({ answerState: "draft", points: 0 });
    });
});

describe("player view — khoi-dong", () => {
    const P1 = ["a1", "a2", "a3", "a4", "a5", "a6"];
    const P2 = ["b1", "b2", "b3", "b4", "b5", "b6"];

    it("phase 1 is oral: nothing to type, and it says whose run it is", () => {
        const state = startKhoiDong(["p0", "p1"], P1);
        const mine = buildPlayerView(base({ roundId: "khoi-dong", state }));
        const theirs = buildPlayerView(base({ roundId: "khoi-dong", state, userId: "p1" }));
        expect(mine.open).toEqual([]);
        expect(mine.me.isMyRun).toBe(true);
        expect(theirs.me.isMyRun).toBe(false);
    });

    it("phase 2 opens the whole batch for typing, with a 60 s deadline", () => {
        const state = beginPhase2(finishSetup(["p0", "p1"], P1, P2), P2, NOW);
        const view = buildPlayerView(base({ roundId: "khoi-dong", state }));
        expect(view.open).toHaveLength(6);
        expect(view.open[0]).toEqual({ questionId: "b1", deadlineAt: at(60), question: null });
    });

    it("separates what the player drafted from what is final", () => {
        const state = beginPhase2(finishSetup(["p0", "p1"], P1, P2), P2, NOW);
        const view = buildPlayerView(base({
            roundId: "khoi-dong", state,
            submitted: [{ questionId: "b1", judged: false }, { questionId: "b2", judged: true }]
        }));
        expect(view.me.answered).toEqual(["b1", "b2"]);
        expect(view.me.finalized).toEqual(["b2"]);
    });
});

describe("player view — an unknown round", () => {
    it("degrades to an empty view instead of throwing", () => {
        const view = buildPlayerView(base({ roundId: "tie-break" }));
        expect(view).toMatchObject({ stage: "unknown", open: [], me: {} });
    });
});

describe("player view — ve-dich", () => {
    const VQ = (domain: string, value: number): VeDichQuestion => ({ id: `${domain}-${value}`, domain, value });
    const POOL = [VQ("THTH", 50), VQ("THTH", 40), VQ("THTH", 30), VQ("THTH", 20)];
    const P = (id: string): PlayerState => ({ id, score: 0, powersLeft: ["HOPE", "SHIELD"] });

    const phase1 = () => createVeDich(POOL, [P("p0"), P("p1")]);

    function phase2Open() {
        let s = phase1();
        s = advanceTurn(advanceTurn(s));
        s = beginVeDichPhase2(s);
        const current = s.players[0].id;
        const ids = s.remaining.slice(0, 3).map((q) => q.id);
        s = pickPhase2(s, current, ids);
        s = openPhase2Question(s, ids[0]);
        return { state: s, current, questionId: ids[0] };
    }

    it("phase 1 offers nothing to type; it says whose turn it is to pick", () => {
        const mine = buildPlayerView(base({ roundId: "ve-dich", state: phase1(), userId: "p0" }));
        const theirs = buildPlayerView(base({ roundId: "ve-dich", state: phase1(), userId: "p1" }));
        expect(mine.stage).toBe("phase1");
        expect(mine.open).toEqual([]);
        expect(mine.me.isMyTurn).toBe(true);
        expect(theirs.me.isMyTurn).toBe(false);
        expect(mine.me.powersLeft).toEqual(["HOPE", "SHIELD"]);
    });

    it("phase 2: the answerer can answer and declare a power", () => {
        const { state, current, questionId } = phase2Open();
        const view = buildPlayerView(base({ roundId: "ve-dich", state, userId: current }));
        expect(view.stage).toBe("phase2");
        expect(view.open[0].questionId).toBe(questionId);
        expect(view.me).toMatchObject({ canAnswer: true, canDeclarePower: true, canBuzz: false, isAnswerer: true });
    });

    it("phase 2: others can buzz once the window opens, and see its deadline", () => {
        const { state } = phase2Open();
        const withBuzzWindow = closeCurrentAnswer(state, NOW);
        const other = withBuzzWindow.players.find((p) => p.id !== withBuzzWindow.open!.answerer)!.id;

        const view = buildPlayerView(base({ roundId: "ve-dich", state: withBuzzWindow, userId: other }));
        expect(view.me.canBuzz).toBe(true);
        expect(view.me.canAnswer).toBe(false);
        expect(view.open[0].deadlineAt).toBe(at(5));         // the 5 s buzz window
    });

    it("phase 2: an expired buzz window offers no buzz", () => {
        const { state } = phase2Open();
        const withBuzzWindow = closeCurrentAnswer(state, NOW);
        const other = withBuzzWindow.players.find((p) => p.id !== withBuzzWindow.open!.answerer)!.id;

        const view = buildPlayerView(base({ roundId: "ve-dich", state: withBuzzWindow, userId: other, now: at(6) }));
        expect(view.me.canBuzz).toBe(false);
    });

    it("an ended round says so and offers nothing", () => {
        const ended = { ...phase1(), ended: true };
        const view = buildPlayerView(base({ roundId: "ve-dich", state: ended }));
        expect(view.stage).toBe("ended");
        expect(view.me.isMyTurn).toBe(false);
    });
});


// ─── L1: what the live surface adds to the view (docs/live-surface.md) ───────

const frozen = (ids: string[], kind: "MC" | "TEXT" = "MC"): MatchQuestion[] =>
    ids.map((id, index) => ({
        _id: id,
        roundId: "r",
        turnId: "t",
        position: index,
        mode: "text",
        kind,
        questionText: `Text of ${id}`,
        media: null,
        timeLimit: null,
        tag: "THTH",
        payload: kind === "MC"
            ? { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctSet: ["a"] }
            : { acceptedAnswers: ["x"] },
        sourceId: "src"
    }) as unknown as MatchQuestion);

describe("player view — payloads (G1)", () => {
    it("carries the frozen question on every open entry, never the answer", () => {
        const state = openCurrentQuestion(startButPha(["q1", "q2", "q3", "q4"]), NOW);
        const view = buildPlayerView(base({ roundId: "but-pha", state, questions: frozen(["q1", "q2", "q3", "q4"]) }));

        expect(view.open[0]?.question).toMatchObject({
            questionId: "q1",
            questionText: "Text of q1",
            payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] }
        });
        const wire = JSON.stringify(view);
        expect(wire).not.toContain("correctSet");
        expect(wire).not.toContain("acceptedAnswers");
    });

    it("an unknown id degrades to null instead of throwing", () => {
        const state = openCurrentQuestion(startButPha(["q1", "q2", "q3", "q4"]), NOW);
        const view = buildPlayerView(base({ roundId: "but-pha", state })); // no questions passed
        expect(view.open[0]?.question).toBeNull();
    });

    it("revealed hints arrive with their content (G7)", () => {
        const H = ["h1", "h2"];
        const base6 = openHint(startGiaiMa(["p0", "p1"], H), "h2", NOW);
        const advanced = {
            ...base6,
            players: base6.players.map((p) =>
                p.id === "p0" ? { ...p, revealed: ["h1"] } : p
            )
        };
        const view = buildPlayerView(base({
            roundId: "giai-ma",
            state: advanced,
            questions: frozen(H)
        }));
        expect(view.me.revealedHints).toEqual([
            { questionId: "h1", question: expect.objectContaining({ questionText: "Text of h1" }) }
        ]);
    });
});

describe("player view — oral for everyone (G2)", () => {
    it("phase 1 puts the active run's question on EVERY screen, with the run budget", () => {
        const ids = ["o1", "o2", "o3", "o4", "o5", "o6"];
        const state = startKhoiDong(["p0", "p1"], ids);
        const questions = frozen(ids, "TEXT");

        const mine = buildPlayerView(base({ roundId: "khoi-dong", state, questions }));
        const theirs = buildPlayerView(base({ roundId: "khoi-dong", state, userId: "p1", questions }));

        for (const view of [mine, theirs]) {
            expect(view.oral).toMatchObject({
                questionId: "o1",
                playerId: "p0",
                index: 0,
                total: 6,
                elapsedS: expect.any(Number),
                budgetS: expect.any(Number)
            });
            expect(view.oral?.question?.questionText).toBe("Text of o1");
        }
        expect(mine.me.isMyRun).toBe(true);
        expect(theirs.me.isMyRun).toBe(false);
    });
});

describe("player view — ve-dich board (G3)", () => {
    const VQ = (domain: string, value: number): VeDichQuestion => ({ id: `${domain}-${value}`, domain, value });
    const POOL = [VQ("THTH", 50), VQ("THTH", 40), VQ("TNTT", 30), VQ("XHPL", 20)];
    const P = (id: string): PlayerState => ({ id, score: 0, powersLeft: ["HOPE", "SHIELD"] });

    it("lists every free cell with its domain and value", () => {
        const state = createVeDich(POOL, [P("p0"), P("p1")]);
        const view = buildPlayerView(base({ roundId: "ve-dich", state, userId: "p0" }));

        expect(view.board).toHaveLength(4);
        expect(view.board?.every((cell) => cell.where === "free")).toBe(true);
        expect(view.board).toContainEqual({ questionId: "THTH-50", domain: "THTH", value: 50, where: "free" });
    });

    it("marks the open question and this turn's picks, each cell exactly once", () => {
        let state = createVeDich(POOL, [P("p0"), P("p1")]);
        state = advanceTurn(advanceTurn(state));   // phase 1 must run its turns first
        state = beginVeDichPhase2(state);
        const ids = state.remaining.slice(0, 3).map((q) => q.id);
        state = pickPhase2(state, "p0", ids);
        state = openPhase2Question(state, ids[0]);

        const view = buildPlayerView(base({ roundId: "ve-dich", state, userId: "p1" }));
        const cellIds = (view.board ?? []).map((cell) => cell.questionId);
        expect(new Set(cellIds).size).toBe(cellIds.length);     // no duplicates
        expect(view.board?.find((cell) => cell.where === "open")?.questionId).toBe(ids[0]);
        expect(view.board?.some((cell) => cell.where === "free")).toBe(true);
    });
});

describe("player view — shared scoreboard (G4)", () => {
    it("ranks the table, equal points sharing a rank", () => {
        const state = openHint(startGiaiMa(["p0"], ["h1"]), "h1", NOW);
        const view = buildPlayerView(base({
            roundId: "giai-ma",
            state,
            table: [
                { id: "p1", displayName: "Bee", points: 5 },
                { id: "p0", displayName: "Ace", points: 10 },
                { id: "p2", displayName: "Cid", points: 10 }
            ]
        }));

        expect(view.table).toEqual([
            { id: "p0", displayName: "Ace", points: 10, rank: 1 },
            { id: "p2", displayName: "Cid", points: 10, rank: 1 },
            { id: "p1", displayName: "Bee", points: 5, rank: 3 }
        ]);
    });

    it("an absent table reads as empty, not undefined", () => {
        const state = openHint(startGiaiMa(["p0"], ["h1"]), "h1", NOW);
        const view = buildPlayerView(base({ roundId: "giai-ma", state }));
        expect(view.table).toEqual([]);
    });
});
