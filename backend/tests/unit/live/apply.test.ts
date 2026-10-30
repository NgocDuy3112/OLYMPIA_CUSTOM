import { describe, expect, it } from "vitest";
import { applyLiveAction, type LiveRecord, type LiveStore, type Transition } from "../../../src/modules/live/apply.js";
import type { LiveFact } from "../../../src/modules/live/facts.js";
import { LiveConflictError } from "../../../src/modules/live/conflict.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

// In-memory store that behaves like a transaction: a failing callback leaves the stored
// record untouched (state and facts together), and a successful one commits both.
function memoryStore<S>(
    initial: LiveRecord<S>,
    answersByQuestion: Record<string, Record<string, boolean>> = {}
) {
    let committed = structuredClone(initial);
    let committedFacts: LiveFact[] = [];

    const store: LiveStore<S> = {
        async transact(fn) {
            let working = structuredClone(committed);
            let pendingFacts: LiveFact[] = [];
            let pendingWrite = false;
            const tx = {
                async load() { return structuredClone(working); },
                async save(next: LiveRecord<S>) { working = structuredClone(next); pendingWrite = true; },
                async recordFacts(facts: LiveFact[]) {
                    pendingFacts = [...pendingFacts, ...structuredClone(facts)];
                    pendingWrite = true;
                },
                async readAnswers(questionId: string) {
                    return structuredClone(answersByQuestion[questionId] ?? {});
                },
                async readAnswerDrafts() {
                    return [];
                }
            };
            const result = await fn(tx);
            if (pendingWrite) { committed = working; committedFacts = pendingFacts; }
            return result;
        }
    };

    return { store, get record() { return committed; }, get facts() { return committedFacts; } };
}

type Counter = { hints: number };
const T = (state: Counter, facts: LiveFact[] = [], roundId?: string): Transition<Counter> =>
    roundId === undefined ? { state, facts } : { state, facts, roundId };

const rec = (version: number, hints: number, roundId = "giai-ma"): LiveRecord<Counter> =>
    ({ version, roundId, state: { hints } });

const sampleAnswer: LiveFact = {
    type: "answer", questionId: "q1", userId: "u1", value: { text: "x" },
    verdict: "CORRECT", pointsAwarded: 10, autoMatched: false
};

describe("applyLiveAction — version guard", () => {
    it("a matching version applies, bumps the version, and keeps the round", async () => {
        const m = memoryStore<Counter>(rec(3, 0));
        const out = await applyLiveAction(m.store, {
            expectedVersion: 3,
            transition: (c) => T({ hints: c.state.hints + 1 })
        });
        expect(out.version).toBe(4);
        expect(out.roundId).toBe("giai-ma");
        expect(m.record).toMatchObject({ version: 4, roundId: "giai-ma", state: { hints: 1 } });
    });

    it("a stale version is rejected with a conflict, and nothing is written", async () => {
        const m = memoryStore<Counter>(rec(5, 0));
        await expect(applyLiveAction(m.store, {
            expectedVersion: 4, transition: (c) => T({ hints: c.state.hints + 1 })
        })).rejects.toBeInstanceOf(LiveConflictError);
        expect(m.record).toMatchObject({ version: 5, state: { hints: 0 } });
    });

    it("the conflict reports both versions so the console can reload", async () => {
        const m = memoryStore<Counter>(rec(7, 0));
        await expect(applyLiveAction(m.store, {
            expectedVersion: 2, transition: (c) => T(c.state)
        })).rejects.toMatchObject({ expectedVersion: 2, currentVersion: 7 });
    });

    it("rejects a malformed expected version before touching state", async () => {
        const m = memoryStore<Counter>(rec(0, 0));
        await expect(applyLiveAction(m.store, {
            expectedVersion: -1, transition: (c) => T(c.state)
        })).rejects.toBeInstanceOf(RangeError);
        expect(m.record).toMatchObject({ version: 0 });
    });
});

describe("applyLiveAction — rule violations roll back", () => {
    it("a RuleError from the transition writes no state and no facts", async () => {
        const m = memoryStore<Counter>(rec(1, 0));
        await expect(applyLiveAction(m.store, {
            expectedVersion: 1,
            transition: () => { throw new RuleError("HINT_CONSUMED", "already used"); }
        })).rejects.toBeInstanceOf(RuleError);
        expect(m.record).toMatchObject({ version: 1, state: { hints: 0 } });
        expect(m.facts).toEqual([]);
    });
});

describe("applyLiveAction — facts commit with the state", () => {
    it("facts are written in the same commit as the state", async () => {
        const m = memoryStore<Counter>(rec(0, 0));
        await applyLiveAction(m.store, {
            expectedVersion: 0,
            transition: (c) => T({ hints: c.state.hints + 1 }, [sampleAnswer])
        });
        expect(m.record).toMatchObject({ version: 1, state: { hints: 1 } });
        expect(m.facts).toEqual([sampleAnswer]);
    });

    it("when the transition throws, no facts are committed", async () => {
        const m = memoryStore<Counter>(rec(0, 0));
        await applyLiveAction(m.store, {
            expectedVersion: 0,
            transition: () => { throw new RuleError("X", "boom"); }
        }).catch(() => undefined);
        expect(m.facts).toEqual([]);
    });
});

describe("applyLiveAction — round navigation (round.goTo changes the round id)", () => {
    it("a transition may change the round id", async () => {
        const m = memoryStore<Counter>(rec(0, 0, "giai-ma"));
        const out = await applyLiveAction(m.store, {
            expectedVersion: 0,
            transition: () => T({ hints: 0 }, [], "but-pha")
        });
        expect(out.roundId).toBe("but-pha");
        expect(out.state).toEqual({ hints: 0 });
    });
});

describe("applyLiveAction — reject, don't queue", () => {
    it("two actions based on the same version: the first commits, the second is rejected", async () => {
        const m = memoryStore<Counter>(rec(0, 0));
        const first = await applyLiveAction(m.store, {
            expectedVersion: 0, transition: (c) => T({ hints: c.state.hints + 1 })
        });
        expect(first.version).toBe(1);
        await expect(applyLiveAction(m.store, {
            expectedVersion: 0, transition: (c) => T({ hints: c.state.hints + 10 })
        })).rejects.toBeInstanceOf(LiveConflictError);
        expect(m.record).toMatchObject({ version: 1, state: { hints: 1 } });
    });

    it("after a reload the console can act again on the new version", async () => {
        const m = memoryStore<Counter>(rec(0, 0));
        await applyLiveAction(m.store, { expectedVersion: 0, transition: (c) => T({ hints: c.state.hints + 1 }) });
        const retry = await applyLiveAction(m.store, {
            expectedVersion: 1, transition: (c) => T({ hints: c.state.hints + 10 })
        });
        expect(retry.state).toEqual({ hints: 11 });
        expect(retry.version).toBe(2);
    });
});

describe("applyLiveAction — the transition can read inside the transaction", () => {
    it("submitted answers read via the tx reach the transition", async () => {
        const m = memoryStore<Counter>(rec(0, 0), { q1: { u1: true, u2: false } });
        const out = await applyLiveAction(m.store, {
            expectedVersion: 0,
            transition: async (c, tx) => {
                const submitted = await tx.readAnswers("q1");
                return T({ hints: c.state.hints + (submitted.u1 ? 1 : 0) + (submitted.u2 ? 1 : 0) });
            }
        });
        expect(out.state).toEqual({ hints: 1 });
    });

    it("a missing question reads as no answers", async () => {
        const m = memoryStore<Counter>(rec(0, 0));
        const out = await applyLiveAction(m.store, {
            expectedVersion: 0,
            transition: async (c, tx) => {
                const submitted = await tx.readAnswers("nope");
                return T({ hints: c.state.hints + Object.keys(submitted).length });
            }
        });
        expect(out.state).toEqual({ hints: 0 });
    });
});
