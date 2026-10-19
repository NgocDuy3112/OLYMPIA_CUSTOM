import { describe, expect, it } from "vitest";
import { buildPlayerView, type SubmittedAnswer } from "../../../src/modules/live/view.js";
import { openHint, startGiaiMa } from "../../../src/game/engine/turns/giai-ma.js";
import { openCurrentQuestion, startButPha, submitAnswer } from "../../../src/game/engine/turns/but-pha.js";
import { startKhoiDong } from "../../../src/game/engine/turns/khoi-dong-round.js";
import { beginPhase2, finishSetup } from "./helpers.js";

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
        expect(view.open).toEqual([{ questionId: "h2", deadlineAt: at(15) }]);
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
        expect(view.me).toMatchObject({ keywordValue: 70, hintsRevealed: 3, revealedHints: ["h1", "h2", "h3"] });
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
        expect(view.open).toEqual([{ questionId: "q1", deadlineAt: at(30) }]);
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
        expect(view.open[0]).toEqual({ questionId: "b1", deadlineAt: at(60) });
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
        const view = buildPlayerView(base({ roundId: "ve-dich" }));
        expect(view).toMatchObject({ stage: "unknown", open: [], me: {} });
    });
});
