import { describe, expect, it } from "vitest";
import { applyVeDichAction, type VeDichContext } from "../../../src/modules/live/ve-dich.js";
import {
    advanceTurn,
    beginPhase2,
    createVeDich,
    openPhase2Question,
    pickPhase1,
    pickPhase2,
    type PlayerState,
    type VeDichQuestion,
    type VeDichState
} from "../../../src/game/engine/turns/ve-dich.js";
import type { AnswerDraft } from "../../../src/modules/live/apply.js";
import { VeDichRuleError } from "../../../src/game/engine/turns/ve-dich.js";

const NOW = "2026-01-01T00:00:00.000Z";
const at = (s: number) => new Date(Date.parse(NOW) + s * 1000).toISOString();

const Q = (domain: string, value: number): VeDichQuestion => ({ id: `${domain}-${value}`, domain, value });
const POOL = [Q("THTH", 50), Q("THTH", 40), Q("THTH", 30), Q("THTH", 20), Q("TNSS", 50), Q("TNSS", 40)];
const PLAYERS = ["p0", "p1", "p2"];

const ctx = (over: Partial<VeDichContext> = {}): VeDichContext => ({
    actorId: "mc-1", roundId: "ve-dich", now: NOW,
    questions: POOL, players: PLAYERS.map((id) => ({ id, score: 0 })), drafts: [],
    ...over
});

const started = (scores: number[] = [0, 0, 0]): VeDichState =>
    applyVeDichAction(createVeDich([], []), { kind: "ve-dich.start" }, ctx({
        players: PLAYERS.map((id, i) => ({ id, score: scores[i] }))
    })).state;

const draft = (userId: string): AnswerDraft =>
    ({ userId, suggestion: "CORRECT", answeredMs: 1_000, judged: false });

function phase1Done(): VeDichState {
    let s = started();
    for (let i = 0; i < PLAYERS.length; i++) s = advanceTurn(s);
    return s;
}

function phase2Open(playerId: string, questionId: string): VeDichState {
    let s = beginPhase2(phase1Done());
    const ids = s.remaining.slice(0, 3).map((q) => q.id);
    s = pickPhase2(s, playerId, ids);
    return openPhase2Question(s, questionId);
}

describe("ve-dich start", () => {
    it("creates the round with both powers and the cumulative score as the seed", () => {
        const s = started([10, 50, 0]);
        expect(s.players.map((p) => p.id)).toEqual(["p1", "p0", "p2"]);   // highest first
        expect(s.players[0].score).toBe(50);
        expect(s.players.every((p) => p.powersLeft.length === 2)).toBe(true);
        expect(s.phase).toBe(1);
        expect(s.ended).toBe(false);
    });
});

describe("ve-dich picks", () => {
    it("a phase-1 pick records a PICK event and opens the question", () => {
        const s = started();
        const res = applyVeDichAction(s, { kind: "ve-dich.pick", playerId: "p0", questionId: "THTH-50" }, ctx());
        expect(res.state.open?.question.id).toBe("THTH-50");
        expect(res.facts[0]).toMatchObject({
            type: "event", questionId: "THTH-50", userId: "p0", kind: "PICK",
            payload: { kind: "PICK", turnId: "phase-1", pickOrder: 1 }
        });
    });

    it("a phase-2 batch records one PICK event per question", () => {
        const s = beginPhase2(phase1Done());
        const ids = s.remaining.slice(0, 3).map((q) => q.id);
        const res = applyVeDichAction(s, {
            kind: "ve-dich.pickBatch", playerId: s.players[0].id, questionIds: ids
        }, ctx());
        expect(res.facts).toHaveLength(3);
        expect((res.facts[0] as { payload: { turnId: string } }).payload.turnId).toBe("phase-2");
    });

    it("picking out of turn is rejected", () => {
        const s = started();
        expect(() => applyVeDichAction(s, { kind: "ve-dich.pick", playerId: "p2", questionId: "THTH-50" }, ctx()))
            .toThrow(VeDichRuleError);
    });
});

describe("ve-dich powers and buzz", () => {
    it("declaring a power spends it and records a POWER event", () => {
        const s = phase2Open("p0", "THTH-50");
        const res = applyVeDichAction(s, {
            kind: "ve-dich.declarePower", playerId: "p0", power: "HOPE"
        }, ctx());
        expect(res.facts[0]).toMatchObject({
            type: "event", userId: "p0", kind: "POWER", payload: { kind: "POWER", power: "HOPE" }
        });
        expect(res.state.players.find((p) => p.id === "p0")!.powersLeft).toEqual(["SHIELD"]);
        expect(res.state.open?.power).toBe("HOPE");
    });

    it("a buzz records how long it took, measured from the window opening", () => {
        let s = phase2Open("p0", "THTH-50");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx({ now: at(0) })).state;
        const res = applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx({ now: at(1.5) }));
        expect(res.facts[0]).toMatchObject({
            type: "event", userId: "p1", kind: "BUZZ", payload: { kind: "BUZZ", buzzMs: 1500, won: true }
        });
        expect(res.state.open?.buzzer).toBe("p1");
    });

    it("a second buzz is rejected by the engine", () => {
        let s = phase2Open("p0", "THTH-50");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx()).state;
        s = applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx()).state;
        expect(() => applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p2" }, ctx())).toThrow(VeDichRuleError);
    });
});

describe("ve-dich resolve", () => {
    it("phase 1, typed: finalizes the player's draft and scores by face value", () => {
        let s = started();
        s = pickPhase1(s, "p0", "THTH-50");
        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: true },
            ctx({ drafts: [draft("p0")] }));
        expect(res.facts[0]).toEqual({
            type: "judge", questionId: "THTH-50", userId: "p0", verdict: "CORRECT", pointsAwarded: 50
        });
        expect(res.state.players.find((p) => p.id === "p0")!.score).toBe(50);
    });

    it("phase 1, wrong with a HOPE: -100% and the points are recorded", () => {
        let s = started();
        s = pickPhase1(s, "p0", "THTH-50");
        s = applyVeDichAction(s, { kind: "ve-dich.declarePower", playerId: "p0", power: "HOPE" }, ctx()).state;
        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: false }, ctx({ drafts: [draft("p0")] }));
        expect(res.facts[0]).toMatchObject({ type: "judge", pointsAwarded: -50 });
    });

    it("phase 1, never submitted: the verdict still scores, as an operator row", () => {
        let s = started();
        s = pickPhase1(s, "p0", "THTH-50");
        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: false }, ctx({ drafts: [] }));
        expect(res.facts[0]).toMatchObject({
            type: "answer", userId: "p0", value: { oral: true }, verdict: "INCORRECT", pointsAwarded: -25
        });
    });

    it("phase 2: the answerer and the buzzer are scored independently", () => {
        let s = phase2Open("p0", "THTH-50");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx()).state;
        s = applyVeDichAction(s, { kind: "ve-dich.buzz", playerId: "p1" }, ctx()).state;

        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: false, buzzer: true }, ctx());
        expect(res.facts).toHaveLength(2);
        expect(res.facts[0]).toMatchObject({ userId: "p0", verdict: "INCORRECT", pointsAwarded: -25 });
        expect(res.facts[1]).toMatchObject({ userId: "p1", verdict: "CORRECT", pointsAwarded: 50 });
    });

    it("phase 2 with no buzz: only the answerer scores", () => {
        let s = phase2Open("p0", "THTH-40");
        s = applyVeDichAction(s, { kind: "ve-dich.closeCurrentAnswer" }, ctx()).state;
        const res = applyVeDichAction(s, { kind: "ve-dich.resolve", answerer: true }, ctx());
        expect(res.facts).toHaveLength(1);
        expect(res.facts[0]).toMatchObject({ userId: "p0", pointsAwarded: 40 });
    });
});

describe("ve-dich flow actions", () => {
    it("advanceTurn moves the cursor", () => {
        const res = applyVeDichAction(started(), { kind: "ve-dich.advanceTurn" }, ctx());
        expect(res.state.turnIndex).toBe(1);
    });

    it("beginPhase2 reorders and the round can be ended", () => {
        const phase2 = applyVeDichAction(phase1Done(), { kind: "ve-dich.beginPhase2" }, ctx());
        expect(phase2.state.phase).toBe(2);

        const ended = applyVeDichAction(phase2.state, { kind: "ve-dich.endRound" }, ctx());
        expect(ended.state.ended).toBe(true);
    });

    it("beginPhase2 before phase 1 is complete is rejected", () => {
        expect(() => applyVeDichAction(started(), { kind: "ve-dich.beginPhase2" }, ctx())).toThrow(VeDichRuleError);
    });
});
