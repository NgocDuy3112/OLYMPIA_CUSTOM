import { describe, expect, it } from "vitest";
import {
    advancing,
    elapsedMs,
    MAX_ANSWER_MS,
    rankQualification,
    scoreQualification,
    type QualificationEntry
} from "../../../src/modules/progression/qualification.js";
import { ProgressionError } from "../../../src/game/contracts/index.js";

const correct = (userId: string, questionId = "q1", answeredMs: number | null = null) =>
    ({ userId, questionId, verdict: "CORRECT" as const, answeredMs });
const wrong = (userId: string, questionId = "q1") =>
    ({ userId, questionId, verdict: "INCORRECT" as const, answeredMs: null });

const entry = (userId: string, points: number, correctCount: number, avgTimeMs: number): QualificationEntry =>
    ({ userId, points, correctCount, avgTimeMs });

describe("crowd-weighted scoring", () => {
    it("pays (y + z) to the correct and charges (x + z) to the wrong", () => {
        // 4-player field: 2 correct, 1 wrong, 1 silent  ->  correct +2, wrong -3
        const { perAnswer } = scoreQualification(
            [correct("a"), correct("b"), wrong("c")],
            4
        );
        expect(perAnswer.get("q1|a")).toBe(2);     // y + z = 1 + 1
        expect(perAnswer.get("q1|b")).toBe(2);
        expect(perAnswer.get("q1|c")).toBe(-3);    // -(x + z) = -(2 + 1)
    });

    it("pays nothing when everyone is correct", () => {
        const { perAnswer } = scoreQualification([correct("a"), correct("b")], 2);
        expect(perAnswer.get("q1|a")).toBe(0);     // y + z = 0
    });

    it("charges nothing when everyone is wrong", () => {
        const { perAnswer } = scoreQualification([wrong("a"), wrong("b")], 2);
        expect(perAnswer.get("q1|a")).toBe(0);     // -(x + z) = 0
    });

    it("the silent players raise what a correct answer is worth", () => {
        const few = scoreQualification([correct("a")], 10).perAnswer.get("q1|a");
        const many = scoreQualification([correct("a"), wrong("b")], 10).perAnswer.get("q1|a");
        expect(few).toBe(9);                       // y=0, z=9
        expect(many).toBe(9);                      // y=1, z=8
    });

    it("accumulates points, correct count and average time across questions", () => {
        const { perPlayer } = scoreQualification(
            [
                correct("a", "q1", 1_000),
                correct("a", "q2", 3_000),
                wrong("a", "q3"),
                correct("b", "q1", 500),
                wrong("b", "q2"),
                wrong("b", "q3")
            ],
            2
        );
        const a = perPlayer.get("a")!;
        expect(a.correctCount).toBe(2);
        expect(a.avgTimeMs).toBe(2_000);           // average over the CORRECT answers only
        // q1 (both correct): 0 ; q2 (a right, b wrong): +1 ; q3 (both wrong): 0
        expect(a.points).toBe(1);
    });

    it("gives a player with no correct answers an infinite average time", () => {
        const { perPlayer } = scoreQualification([wrong("a")], 2);
        expect(perPlayer.get("a")!.avgTimeMs).toBe(Number.POSITIVE_INFINITY);
    });

    it("treats an untimed correct answer as neutral", () => {
        const { perPlayer } = scoreQualification([correct("a", "q1", null)], 2);
        expect(perPlayer.get("a")!.avgTimeMs).toBe(0);
    });
});

describe("ranking — points, then correct count, then average time", () => {
    it("orders by points first", () => {
        const { rows, unresolved } = rankQualification([
            entry("a", 30, 1, 999),
            entry("b", 20, 16, 1)
        ]);
        expect(unresolved).toEqual([]);
        expect(rows.sort((x, y) => x.rank - y.rank).map((r) => r.userId)).toEqual(["a", "b"]);
    });

    it("breaks a points tie on correct count", () => {
        const { rows } = rankQualification([entry("a", 30, 5, 999), entry("b", 30, 9, 999)]);
        expect(rows.sort((x, y) => x.rank - y.rank).map((r) => r.userId)).toEqual(["b", "a"]);
    });

    it("breaks a points and count tie on average time, faster first", () => {
        const { rows } = rankQualification([entry("a", 30, 5, 900), entry("b", 30, 5, 100)]);
        expect(rows.sort((x, y) => x.rank - y.rank).map((r) => r.userId)).toEqual(["b", "a"]);
    });

    it("holds a group back when all three criteria agree", () => {
        const { unresolved } = rankQualification([entry("a", 30, 5, 100), entry("b", 30, 5, 100)]);
        expect(unresolved).toEqual([["a", "b"]]);
    });

    it("applies an explicit order as the last resort", () => {
        const { rows, unresolved } = rankQualification(
            [entry("a", 30, 5, 100), entry("b", 30, 5, 100)],
            { tieBreaks: [{ players: ["a", "b"], order: ["b", "a"] }] }
        );
        expect(unresolved).toEqual([]);
        expect(rows.sort((x, y) => x.rank - y.rank).map((r) => r.userId)).toEqual(["b", "a"]);
    });

    it("rejects an order for players who are not tied on all three criteria", () => {
        expect(() => rankQualification(
            [entry("a", 30, 5, 100), entry("b", 30, 5, 200)],
            { tieBreaks: [{ players: ["a", "b"], order: ["a", "b"] }] }
        )).toThrow(ProgressionError);
    });
});

describe("the advance cut", () => {
    it("blocks a tie that straddles the cut", () => {
        const { unresolved } = rankQualification(
            [entry("a", 50, 9, 10), entry("b", 30, 5, 10), entry("c", 30, 5, 10)],
            { advance: 2 }
        );
        expect(unresolved).toEqual([["b", "c"]]);
    });

    it("orders a tie entirely below the cut without blocking", () => {
        const { unresolved } = rankQualification(
            [entry("a", 50, 9, 10), entry("b", 30, 5, 10), entry("c", 30, 5, 10)],
            { advance: 1 }
        );
        expect(unresolved).toEqual([]);
    });
});

describe("advancing", () => {
    it("takes the top N in rank order", () => {
        const { rows } = rankQualification([entry("a", 30, 1, 1), entry("b", 20, 1, 1)]);
        expect(advancing({ rows, unresolved: [] }, 1)).toEqual(["a"]);
    });
});

// The answer time is the server's: it is measured from the player's last interaction
// with the phase — their first fetch, or their previous answer. A re-fetch never moves
// the anchor, so reloading the page cannot make a player look faster.
describe("the server clock", () => {
    const opened = 1_000_000;

    it("measures the first answer from the moment the phase was opened", () => {
        expect(elapsedMs({ openedAt: opened, lastAnswerAt: null }, opened + 4_000)).toBe(4_000);
    });

    it("measures every later answer from the previous answer", () => {
        const anchor = { openedAt: opened, lastAnswerAt: opened + 4_000 };
        expect(elapsedMs(anchor, opened + 6_500)).toBe(2_500);
    });

    it("never goes backwards", () => {
        expect(elapsedMs({ openedAt: opened, lastAnswerAt: opened + 10_000 }, opened + 5_000)).toBe(0);
    });

    it("caps a player who leaves the tab open for a day", () => {
        expect(elapsedMs({ openedAt: opened, lastAnswerAt: null }, opened + 5 * 24 * 60 * 60 * 1000))
            .toBe(MAX_ANSWER_MS);
    });

    it("does not let a re-fetch move the anchor", () => {
        // The fetch sets openedAt once; a later fetch leaves it alone, so the elapsed
        // time keeps counting from the first opening.
        const first = elapsedMs({ openedAt: opened, lastAnswerAt: null }, opened + 3_000);
        const later = elapsedMs({ openedAt: opened, lastAnswerAt: null }, opened + 3_000);
        expect(later).toBe(first);
    });
});
