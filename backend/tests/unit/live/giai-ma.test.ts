import { GIAI_MA_DEFAULTS } from "../../../src/game/engine/rules.js";
import { describe, expect, it } from "vitest";
import { applyGiaiMaAction, type GiaiMaContext } from "../../../src/modules/live/giai-ma.js";
import type { AnswerDraft } from "../../../src/modules/live/apply.js";
import {
    keywordValueFor,
    startGiaiMa,
    type GiaiMaState
} from "../../../src/game/engine/turns/giai-ma.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const IDS = ["a", "b"];
const H = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];
const NOW = "2026-01-01T00:00:00.000Z";

// One unjudged draft row for a player (the answers ledger's shape).
const draft = (userId: string): AnswerDraft =>
    ({ userId, suggestion: "CORRECT", answeredMs: 1200, judged: false });

const ctx = (answerDrafts: AnswerDraft[] = []): GiaiMaContext =>
    ({
        actorId: "mc-1", rules: GIAI_MA_DEFAULTS, roundId: "giai-ma", hintTurnId: "hints",
        answerDrafts, now: NOW
    });

// The MC's commit: explicit verdicts for the players they staged.
const resolve = (verdicts: Array<{ playerId: string; correct: boolean }>) =>
    ({ kind: "giai-ma.resolveHint" as const, verdicts });

const fresh = (): GiaiMaState => startGiaiMa(IDS, H, GIAI_MA_DEFAULTS);

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

    it("resolveHint applies the MC's explicit verdicts and consumes the hint", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h3" }, ctx()).state;
        const { state } = applyGiaiMaAction(open, resolve([
            { playerId: "a", correct: true },
            { playerId: "b", correct: false }
        ]), ctx([draft("a"), draft("b")]));
        expect(state.picked).toEqual(["h3"]);
        expect(state.openHint).toBeNull();
        expect(keywordValueFor(state, "a")).toBe(90);     // a revealed one hint
        expect(keywordValueFor(state, "b")).toBe(100);    // b's verdict was wrong → nothing
    });

    it("a player with no draft gets nothing — they are simply absent from the verdicts", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx()).state;
        const { state } = applyGiaiMaAction(open, resolve([{ playerId: "a", correct: true }]),
            ctx([draft("a")]));                    // b never answered
        expect(keywordValueFor(state, "a")).toBe(90);
        expect(keywordValueFor(state, "b")).toBe(100);
    });

    it("a submitted answer without a verdict BLOCKS the resolve (no auto-verdict)", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx()).state;
        // both submitted, but the MC staged only "a" → refuse, nothing is revealed
        expect(() => applyGiaiMaAction(open, resolve([{ playerId: "a", correct: true }]),
            ctx([draft("a"), draft("b")]))).toThrow(RuleError);
        try {
            applyGiaiMaAction(open, resolve([{ playerId: "a", correct: true }]),
                ctx([draft("a"), draft("b")]));
        } catch (e) {
            expect((e as RuleError).code).toBe("UNJUDGED_ANSWERS");
        }
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
        const done = applyGiaiMaAction(one.state, resolve([
            { playerId: "a", correct: true }, { playerId: "b", correct: true }
        ]), ctx([draft("a"), draft("b")]));
        const two = applyGiaiMaAction(done.state, { kind: "giai-ma.openHint", hintId: "h2" }, ctx());
        expect((one.facts[0] as { payload: { pickOrder: number } }).payload.pickOrder).toBe(1);
        expect((two.facts[0] as { payload: { pickOrder: number } }).payload.pickOrder).toBe(2);
    });

    it("resolveHint judges every draft row in the same transaction (points 0)", () => {
        const open = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx()).state;
        const { facts } = applyGiaiMaAction(open, resolve([
            { playerId: "a", correct: true },
            { playerId: "b", correct: false }
        ]), ctx([draft("a"), draft("b")]));
        expect(facts).toHaveLength(2);
        expect(facts[0]).toMatchObject({
            type: "judge", questionId: "h1", userId: "a",
            verdict: "CORRECT", pointsAwarded: 0       // a hint never scores match points
        });
        expect(facts[1]).toMatchObject({
            type: "judge", questionId: "h1", userId: "b",
            verdict: "INCORRECT", pointsAwarded: 0
        });
    });

    it("submitKeyword stores the typed text as a draft (no verdict, no points)", () => {
        const opened = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx()).state;
        const s = applyGiaiMaAction(opened, resolve([
            { playerId: "a", correct: true }, { playerId: "b", correct: false }
        ]), ctx([draft("a"), draft("b")])).state;

        const { state, facts } = applyGiaiMaAction(s, {
            kind: "giai-ma.submitKeyword",
            playerId: "a", questionId: "kw", text: "DIENBIENPHU", suggestion: "CORRECT"
        }, ctx());
        expect(facts).toHaveLength(1);
        expect(facts[0]).toMatchObject({
            type: "draft", questionId: "kw", userId: "a",
            value: { text: "DIENBIENPHU" }, suggestion: "CORRECT"
        });
        // locked, but nothing judged and nothing awarded yet
        expect(state.players.find((p) => p.id === "a")!.keywordLocked).toBe(true);
        expect(state.players.find((p) => p.id === "a")!.keywordPoints).toBe(0);
    });

    it("judgeKeyword UPDATES the draft row with the MC's verdict and the frozen value", () => {
        const opened = applyGiaiMaAction(fresh(), { kind: "giai-ma.openHint", hintId: "h1" }, ctx()).state;
        const submitted = applyGiaiMaAction(opened, {
            kind: "giai-ma.submitKeyword",
            playerId: "a", questionId: "kw", text: "DIENBIENPHU", suggestion: "INCORRECT"
        }, ctx()).state;

        const { state, facts } = applyGiaiMaAction(submitted, {
            kind: "giai-ma.judgeKeyword", playerId: "a", questionId: "kw", correct: true
        }, ctx());
        expect(facts).toHaveLength(1);
        // JudgeFact: verdict + points, no insert — it updates the draft row
        expect(facts[0]).toMatchObject({
            type: "judge", questionId: "kw", userId: "a",
            verdict: "CORRECT", pointsAwarded: 100            // fresh round: no hints → 100
        });
        expect(state.players.find((p) => p.id === "a")!.keywordPoints).toBe(100);
    });
});
