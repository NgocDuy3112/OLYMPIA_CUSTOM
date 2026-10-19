import { describe, expect, it } from "vitest";
import { applyButPhaAction, type ButPhaContext } from "../../../src/modules/live/but-pha.js";
import { butPhaTotal, startButPha, type ButPhaState } from "../../../src/game/engine/turns/but-pha.js";
import type { AnswerDraft } from "../../../src/modules/live/apply.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const Q = ["q1", "q2", "q3", "q4"];
const NOW = "2026-01-01T00:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(NOW) + sec * 1000).toISOString();

const draft = (userId: string, answeredMs: number, judged = false): AnswerDraft =>
    ({ userId, suggestion: "CORRECT", answeredMs, judged });

const ctx = (over: Partial<ButPhaContext> = {}): ButPhaContext => ({
    actorId: "mc-1", roundId: "but-pha", now: NOW, questionIds: Q, answerDrafts: [], ...over
});

const fresh = (): ButPhaState => startButPha(Q);
const open = (): ButPhaState =>
    applyButPhaAction(fresh(), { kind: "but-pha.openQuestion" }, ctx()).state;

describe("applyButPhaAction — flow", () => {
    it("start builds the round from the server-resolved question ids", () => {
        const { state } = applyButPhaAction(fresh(), { kind: "but-pha.start" }, ctx());
        expect(state.questionIds).toEqual(Q);
        expect(state.ended).toBe(false);
    });

    it("openQuestion starts the clock; a second open is rejected", () => {
        const s = applyButPhaAction(fresh(), { kind: "but-pha.openQuestion" }, ctx()).state;
        expect(s.questionOpenedAt).toBe(NOW);
        expect(() => applyButPhaAction(s, { kind: "but-pha.openQuestion" }, ctx())).toThrow(RuleError);
    });

    it("closeQuestion advances and clears the clock", () => {
        const { state } = applyButPhaAction(open(), { kind: "but-pha.closeQuestion" }, ctx());
        expect(state.cursor).toBe(1);
        expect(state.questionOpenedAt).toBeNull();
    });

    it("endRound ends the round early", () => {
        expect(applyButPhaAction(fresh(), { kind: "but-pha.endRound" }, ctx()).state.ended).toBe(true);
    });
});

describe("applyButPhaAction — finalize computes the speed order", () => {
    function finalize(verdicts: Array<{ playerId: string; correct: boolean }>, drafts: AnswerDraft[]) {
        return applyButPhaAction(open(), {
            kind: "but-pha.finalize", questionId: "q1", verdicts
        }, ctx({ now: at(0), answerDrafts: drafts }));
    }

    it("ranks the correct answers by submission time: 1st x4, 2nd x3", () => {
        const res = finalize(
            [{ playerId: "a", correct: true }, { playerId: "b", correct: true }],
            [draft("a", 3_000), draft("b", 7_000)]
        );
        // 3 s -> base 15, first correct -> x4 = 60 ; 7 s -> base 10, second -> x3 = 30
        expect(butPhaTotal(res.state, "a")).toBe(60);
        expect(butPhaTotal(res.state, "b")).toBe(30);
    });

    it("order follows submission time, not the order the controller listed", () => {
        const res = finalize(
            [{ playerId: "b", correct: true }, { playerId: "a", correct: true }],
            [draft("a", 3_000), draft("b", 7_000)]
        );
        expect(butPhaTotal(res.state, "a")).toBe(60);   // a submitted first, so a is 1st
        expect(butPhaTotal(res.state, "b")).toBe(30);
    });

    it("a wrong answer scores 0 and takes no speed rung", () => {
        const res = finalize(
            [{ playerId: "a", correct: false }, { playerId: "b", correct: true }],
            [draft("a", 1_000), draft("b", 3_000)]
        );
        expect(butPhaTotal(res.state, "a")).toBe(0);
        expect(butPhaTotal(res.state, "b")).toBe(60);   // still the 1st correct
    });

    it("an answer at exactly 30 s is in time; past 30 s is forced wrong", () => {
        const onTime = finalize([{ playerId: "a", correct: true }], [draft("a", 30_000)]);
        expect(butPhaTotal(onTime.state, "a")).toBe(20);      // base 5 x4

        const late = finalize([{ playerId: "a", correct: true }], [draft("a", 30_500)]);
        expect(butPhaTotal(late.state, "a")).toBe(0);
        expect(late.facts[0]).toMatchObject({ verdict: "INCORRECT", pointsAwarded: 0 });
    });

    it("emits a judge fact per answerer with the awarded points", () => {
        const res = finalize([{ playerId: "a", correct: true }], [draft("a", 2_000)]);
        expect(res.facts).toEqual([
            { type: "judge", questionId: "q1", userId: "a", verdict: "CORRECT", pointsAwarded: 60 }
        ]);
    });

    it("cannot finalize a player who never submitted", () => {
        expect(() => finalize([{ playerId: "ghost", correct: true }], [draft("a", 1_000)]))
            .toThrow(RuleError);
    });

    it("finalizing the wrong question is rejected", () => {
        expect(() => applyButPhaAction(open(), {
            kind: "but-pha.finalize", questionId: "q2", verdicts: [{ playerId: "a", correct: true }]
        }, ctx({ answerDrafts: [draft("a", 1_000)] }))).toThrow(RuleError);
    });

    it("a question cannot be finalized twice", () => {
        const once = finalize([{ playerId: "a", correct: true }], [draft("a", 1_000)]).state;
        expect(() => applyButPhaAction(once, {
            kind: "but-pha.finalize", questionId: "q1", verdicts: [{ playerId: "b", correct: true }]
        }, ctx({ answerDrafts: [draft("b", 2_000)] }))).toThrow(RuleError);
    });
});
