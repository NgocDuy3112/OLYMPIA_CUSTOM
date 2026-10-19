import { describe, expect, it } from "vitest";
import { applyButPhaAction, type ButPhaContext } from "../../../src/modules/live/but-pha.js";
import { butPhaTotal, startButPha, type ButPhaState } from "../../../src/game/engine/turns/but-pha.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const Q = ["q1", "q2", "q3", "q4"];
const NOW = "2026-01-01T00:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(NOW) + sec * 1000).toISOString();
const ctx = (now = NOW): ButPhaContext =>
    ({ actorId: "mc-1", roundId: "but-pha", now, questionIds: Q });

const fresh = (): ButPhaState => startButPha(Q);

describe("applyButPhaAction — flow", () => {
    it("start builds the round from the server-resolved question ids", () => {
        const { state } = applyButPhaAction(fresh(), { kind: "but-pha.start" }, ctx());
        expect(state.questionIds).toEqual(Q);
        expect(state.ended).toBe(false);
    });

    it("openQuestion starts the clock for the current question", () => {
        const { state } = applyButPhaAction(fresh(), { kind: "but-pha.openQuestion" }, ctx());
        expect(state.questionOpenedAt).toBe(NOW);
    });

    it("openQuestion twice is rejected", () => {
        const open = applyButPhaAction(fresh(), { kind: "but-pha.openQuestion" }, ctx()).state;
        expect(() => applyButPhaAction(open, { kind: "but-pha.openQuestion" }, ctx()))
            .toThrow(RuleError);
    });

    it("closeQuestion advances and clears the clock", () => {
        const open = applyButPhaAction(fresh(), { kind: "but-pha.openQuestion" }, ctx()).state;
        const { state } = applyButPhaAction(open, { kind: "but-pha.closeQuestion" }, ctx());
        expect(state.cursor).toBe(1);
        expect(state.questionOpenedAt).toBeNull();
    });

    it("endRound ends the round early", () => {
        const { state } = applyButPhaAction(fresh(), { kind: "but-pha.endRound" }, ctx());
        expect(state.ended).toBe(true);
    });
});

describe("applyButPhaAction — answers", () => {
    const open = () => applyButPhaAction(fresh(), { kind: "but-pha.openQuestion" }, ctx()).state;

    it("scores by the server-measured time and the correct order", () => {
        const first = applyButPhaAction(open(), {
            kind: "but-pha.submitAnswer", playerId: "a", questionId: "q1", correct: true, text: "x"
        }, ctx(at(3)));
        // 3 s -> base 15, first correct -> x4
        expect(butPhaTotal(first.state, "a")).toBe(60);

        const second = applyButPhaAction(first.state, {
            kind: "but-pha.submitAnswer", playerId: "b", questionId: "q1", correct: true, text: "y"
        }, ctx(at(7)));
        // 7 s -> base 10, second correct -> x3
        expect(butPhaTotal(second.state, "b")).toBe(30);
    });

    it("an answer past 30 s is forced wrong and scores 0", () => {
        const res = applyButPhaAction(open(), {
            kind: "but-pha.submitAnswer", playerId: "a", questionId: "q1", correct: true, text: "x"
        }, ctx(at(30.5)));
        expect(butPhaTotal(res.state, "a")).toBe(0);
        expect(res.facts[0]).toMatchObject({ verdict: "INCORRECT", pointsAwarded: 0 });
    });

    it("an answer at exactly 30 s is in time", () => {
        const res = applyButPhaAction(open(), {
            kind: "but-pha.submitAnswer", playerId: "a", questionId: "q1", correct: true, text: "x"
        }, ctx(at(30)));
        expect(butPhaTotal(res.state, "a")).toBe(20);   // base 5 x4
        expect(res.facts[0]).toMatchObject({ verdict: "CORRECT", pointsAwarded: 20 });
    });

    it("records an answers fact with the awarded points", () => {
        const res = applyButPhaAction(open(), {
            kind: "but-pha.submitAnswer", playerId: "a", questionId: "q1", correct: true, text: "hanoi"
        }, ctx(at(2)));
        expect(res.facts[0]).toMatchObject({
            type: "answer", questionId: "q1", userId: "a", value: { text: "hanoi" },
            verdict: "CORRECT", pointsAwarded: 60, autoMatched: true
        });
    });

    it("a second answer from the same player is rejected", () => {
        const once = applyButPhaAction(open(), {
            kind: "but-pha.submitAnswer", playerId: "a", questionId: "q1", correct: true, text: "x"
        }, ctx(at(1))).state;
        expect(() => applyButPhaAction(once, {
            kind: "but-pha.submitAnswer", playerId: "a", questionId: "q1", correct: true, text: "z"
        }, ctx(at(2)))).toThrow(RuleError);
    });

    it("an answer before the clock starts is rejected", () => {
        expect(() => applyButPhaAction(fresh(), {
            kind: "but-pha.submitAnswer", playerId: "a", questionId: "q1", correct: true, text: "x"
        }, ctx())).toThrow(RuleError);
    });
});
