import { describe, expect, it } from "vitest";
import { applyGiaiMaAction, type GiaiMaContext } from "../../../src/modules/live/giai-ma.js";
import {
    keywordValueFor,
    startGiaiMa,
    type GiaiMaState
} from "../../../src/game/engine/turns/giai-ma.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const IDS = ["a", "b"];
const H = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];
const NOW = "2026-01-01T00:00:00.000Z";
const ctx = (submittedAnswers: Record<string, boolean> = {}): GiaiMaContext =>
    ({ actorId: "mc-1", roundId: "giai-ma", hintTurnId: "hints", submittedAnswers, now: NOW, keywordAutoMatched: false });

const fresh = (): GiaiMaState => startGiaiMa(IDS, H);

describe("applyGiaiMaAction — state transitions", () => {
    it("start creates a fresh round from the players and hint ids", () => {
        const { state } = applyGiaiMaAction(fresh(), {
            kind: "giai-ma.start", playerIds: ["x", "y", "z"], hintIds: ["a1", "a2"]
        }, ctx());
        expect(state.players.map((p) => p.id)).toEqual(["x", "y", "z"]);
        expect(state.hintIds).toEqual(["a1", "a2"]);
        expect(state.openHint).toBeNull();
    });

    it("openHint opens the window for that hint", () => {
        const { state } = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h3" }, ctx());
        expect(state.openHint).toBe("h3");
        expect(state.picked).toEqual([]);          // not consumed until resolved
    });

    it("a second openHint while a window is open is rejected", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h3" }, ctx()).state;
        expect(() => applyGiaiMaAction(open, { kind: "giai-ma.openHint", hintId: "h4" }, ctx()))
            .toThrow(RuleError);
    });

    it("resolveHint applies the submitted answers and consumes the hint", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h3" }, ctx()).state;
        const { state } = applyGiaiMaAction(open, { kind: "giai-ma.resolveHint" },
            ctx({ a: true, b: false }));
        expect(state.picked).toEqual(["h3"]);
        expect(state.openHint).toBeNull();
        expect(keywordValueFor(state, "a")).toBe(90);
        expect(keywordValueFor(state, "b")).toBe(100);
    });

    it("resolveHint treats a missing answer as wrong", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx()).state;
        const { state } = applyGiaiMaAction(open, { kind: "giai-ma.resolveHint" }, ctx({ a: true }));
        expect(keywordValueFor(state, "b")).toBe(100);
    });

    it("closeHintWindow leaves the hint available", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h3" }, ctx()).state;
        const { state } = applyGiaiMaAction(open, { kind: "giai-ma.closeHintWindow" }, ctx());
        expect(state.openHint).toBeNull();
        expect(state.picked).toEqual([]);
    });

    it("endRound finishes the round", () => {
        const { state } = applyGiaiMaAction(fresh(), { kind: "giai-ma.endRound" }, ctx());
        expect(state.stage).toBe("ended");
    });
});

describe("applyGiaiMaAction — facts", () => {
    it("openHint records a PICK event for the MC", () => {
        const { facts } = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h3" }, ctx());
        expect(facts).toHaveLength(1);
        expect(facts[0]).toMatchObject({
            type: "event", questionId: "h3", userId: "mc-1", roundId: "giai-ma",
            kind: "PICK", payload: { kind: "PICK", turnId: "hints", pickOrder: 1 }
        });
    });

    it("the pick order counts the hints opened in sequence", () => {
        const one = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx());
        const done = applyGiaiMaAction(one.state, { kind: "giai-ma.resolveHint" }, ctx({ a: true, b: true }));
        const two = applyGiaiMaAction(done.state, { kind: "giai-ma.openHint", hintId: "h2" }, ctx());
        expect((one.facts[0] as { payload: { pickOrder: number } }).payload.pickOrder).toBe(1);
        expect((two.facts[0] as { payload: { pickOrder: number } }).payload.pickOrder).toBe(2);
    });

    it("resolveHint writes no facts of its own (answers were recorded at submission)", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx()).state;
        const { facts } = applyGiaiMaAction(open, { kind: "giai-ma.resolveHint" }, ctx({ a: true }));
        expect(facts).toEqual([]);
    });

    it("submitKeyword records an answers row with the player's locked value", () => {
        const opened = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx()).state;
        const s = applyGiaiMaAction(opened, { kind: "giai-ma.resolveHint" }, ctx({ a: true, b: false })).state;

        const { facts } = applyGiaiMaAction(s, {
            kind: "giai-ma.submitKeyword",
            playerId: "a", questionId: "kw", correct: true, text: "DIENBIENPHU"
        }, ctx());
        expect(facts).toHaveLength(1);
        expect(facts[0]).toMatchObject({
            type: "answer", questionId: "kw", userId: "a",
            value: { text: "DIENBIENPHU" }, verdict: "CORRECT", pointsAwarded: 90, autoMatched: false
        });
    });
});

describe("applyGiaiMaAction — keyword auto-match flag", () => {
    const kw = (autoMatched: boolean) => applyGiaiMaAction(fresh(), {
        kind: "giai-ma.submitKeyword",
        playerId: "a", questionId: "kw", correct: true, text: "X"
    }, { ...ctx(), keywordAutoMatched: autoMatched });

    it("records a player-typed keyword as auto-matched", () => {
        expect(kw(true).facts[0]).toMatchObject({ type: "answer", autoMatched: true });
    });

    it("records an MC-asserted keyword as not auto-matched", () => {
        expect(kw(false).facts[0]).toMatchObject({ type: "answer", autoMatched: false });
    });
});
