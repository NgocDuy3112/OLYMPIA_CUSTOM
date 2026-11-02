import { describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { LiveActionSchema } from "../../../src/modules/live/actions.js";

// The route's door (POST /live/actions) is guarded by Value.Check(LiveActionSchema).
// This is the contract test for it: every action the CONSOLE's deck may send must
// pass, and the player-door actions (built server-side from a player's own
// command, never from a client claiming a playerId) must stay refused.
//
// The frontend's mirror of this union lives in
// frontend/apps/portal/src/lib/live-actions.ts — change one, change both.

const consoleSent: unknown[] = [
    // giai-ma
    { kind: "giai-ma.start", playerIds: ["p1"], hintIds: ["q1"] },
    { kind: "giai-ma.openHint", hintId: "q1" },
    { kind: "giai-ma.closeHintWindow" },
    { kind: "giai-ma.resolveHint", verdicts: [{ playerId: "p1", correct: true }] },
    { kind: "giai-ma.submitKeyword", playerId: "p1", questionId: "q1", text: "abc", suggestion: "CORRECT" },
    { kind: "giai-ma.judgeKeyword", playerId: "p1", questionId: "q1", correct: false },
    { kind: "giai-ma.endRound" },
    // but-pha
    { kind: "but-pha.start" },
    { kind: "but-pha.openQuestion" },
    { kind: "but-pha.closeQuestion" },
    { kind: "but-pha.endRound" },
    { kind: "but-pha.finalize", questionId: "q1", verdicts: [{ playerId: "p1", correct: true }] },
    // khoi-dong
    { kind: "khoi-dong.start" },
    { kind: "khoi-dong.start", phase: 2 },
    { kind: "khoi-dong.recordOral", correct: true, spentS: 12 },
    { kind: "khoi-dong.timeOutRun" },
    { kind: "khoi-dong.beginPhase2" },
    { kind: "khoi-dong.openBuzz" },
    { kind: "khoi-dong.judgeBuzz", correct: false },
    { kind: "khoi-dong.nextQuestion" },
    { kind: "khoi-dong.closePhase2" },
    { kind: "khoi-dong.endRound" },
    // ve-dich — controller half
    { kind: "ve-dich.start" },
    { kind: "ve-dich.start", phase: 2 },
    { kind: "ve-dich.beginPhase2" },
    { kind: "ve-dich.openQuestion", questionId: "q1" },
    { kind: "ve-dich.closeCurrentAnswer" },
    { kind: "ve-dich.lockBuzz" },
    { kind: "ve-dich.resolve", answerer: true },
    { kind: "ve-dich.resolve", answerer: true, buzzer: false },
    { kind: "ve-dich.advanceTurn" },
    { kind: "ve-dich.endRound" },
    // ve-dich — the console declares powers for the turn player (regression:
    // this was missing from the union and every declare button 400'd)
    { kind: "ve-dich.declarePower", playerId: "p1", power: "STAR" },
    { kind: "ve-dich.declarePower", playerId: "p1", power: "ASSIGN", targetId: "p2" },
    // match-level
    { kind: "round.goTo", roundId: "khoi-dong" },
    { kind: "score.adjust", userId: "p1", delta: -10, reason: "Correction" },
];

// Built ONLY by ve-dich-player.ts from a player's own websocket command —
// a client claiming a playerId must not reach the console door.
const playerDoorOnly: unknown[] = [
    { kind: "ve-dich.pick", playerId: "p1", questionId: "q1" },
    { kind: "ve-dich.pickBatch", playerId: "p1", questionIds: ["a", "b", "c"] },
    { kind: "ve-dich.buzz", playerId: "p1" },
];

describe("LiveActionSchema — the console door's contract", () => {
    it.each(consoleSent)("accepts %j", (action) => {
        expect(Value.Check(LiveActionSchema, action)).toBe(true);
    });

    it.each(playerDoorOnly)("refuses the player-door action %j", (action) => {
        expect(Value.Check(LiveActionSchema, action)).toBe(false);
    });

    it("refuses an unknown kind", () => {
        expect(Value.Check(LiveActionSchema, { kind: "mystery.start" })).toBe(false);
    });

    it("refuses a known kind with a missing field", () => {
        expect(Value.Check(LiveActionSchema, { kind: "ve-dich.resolve" })).toBe(false);
        expect(Value.Check(LiveActionSchema, { kind: "giai-ma.start", playerIds: ["p1"] })).toBe(false);
    });
});
