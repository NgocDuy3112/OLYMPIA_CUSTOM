// Apply one MC action to the live round state. Pure orchestration over an injected
// store, so the version rule and the atomic write can be tested without Postgres.
// In production the store is backed by a SELECT ... FOR UPDATE transaction.
import { assertVersion, nextVersion } from "./conflict.js";
import type { LiveFact } from "./facts.js";

export interface LiveRecord<S> {
    version: number;
    roundId: string;
    state: S;
}

// What a transition produces: the next state, the facts to append alongside it, and
// optionally a new round id (round advancement). Omitting roundId keeps the current one.
export interface Transition<S> {
    state: S;
    facts: LiveFact[];
    roundId?: string;
}

// The transaction handle. Facts and answers are read and written through it, so a
// transition sees a consistent snapshot and its writes commit with the state.
export interface LiveTx<S> {
    load(): Promise<LiveRecord<S>>;
    save(next: LiveRecord<S>): Promise<void>;
    recordFacts(facts: LiveFact[]): Promise<void>;
    // Verdicts submitted for a question, keyed by user. Read inside the transaction so a
    // resolve cannot miss a submission that landed just before it.
    readAnswers(questionId: string): Promise<Record<string, boolean>>;
}

export interface LiveStore<S> {
    // Runs `fn` atomically against the stored record. The state write and every fact
    // commit together, or none do. A throw inside `fn` rolls back.
    transact<T>(fn: (tx: LiveTx<S>) => Promise<T>): Promise<T>;
}

export interface Action<S> {
    expectedVersion: number;
    // The transition sees the whole record and the transaction, so it can read further
    // facts (e.g. submitted answers) before deciding. It may be async. Throws a RuleError
    // to reject the action; nothing is written.
    transition(current: LiveRecord<S>, tx: LiveTx<S>): Transition<S> | Promise<Transition<S>>;
}

// A server-authoritative mutation that does NOT use the optimistic version: player
// actions (e.g. a keyword submission) change the round state, and the client never
// sends a version. The MC's next action with an older version will 409 and reload.
export async function mutateLive<S>(
    store: LiveStore<S>,
    transition: (current: LiveRecord<S>, tx: LiveTx<S>) => Transition<S> | Promise<Transition<S>>
): Promise<LiveRecord<S>> {
    return store.transact(async (tx) => {
        const current = await tx.load();
        const { state, facts, roundId } = await transition(current, tx);
        const next: LiveRecord<S> = {
            version: nextVersion(current.version),
            roundId: roundId ?? current.roundId,
            state
        };
        await tx.save(next);
        if (facts.length > 0) await tx.recordFacts(facts);
        return next;
    });
}

export async function applyLiveAction<S>(
    store: LiveStore<S>,
    action: Action<S>
): Promise<LiveRecord<S>> {
    return store.transact(async (tx) => {
        const current = await tx.load();
        assertVersion(action.expectedVersion, current.version);

        const { state, facts, roundId } = await action.transition(current, tx);
        const next: LiveRecord<S> = {
            version: nextVersion(current.version),
            roundId: roundId ?? current.roundId,
            state
        };
        await tx.save(next);
        if (facts.length > 0) await tx.recordFacts(facts);
        return next;
    });
}
