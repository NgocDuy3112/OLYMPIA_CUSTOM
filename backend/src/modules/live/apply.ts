import { assertVersion, nextVersion } from "./conflict.js";
import { RuleError } from "../../game/engine/turns/errors.js";
import type { LiveFact } from "./facts.js";

export interface LiveRecord<S> {
    version: number;
    roundId: string;
    state: S;
    archive?: Record<string, S>;
}

export interface Transition<S> {
    state: S;
    facts: LiveFact[];
    roundId?: string;
    archive?: Record<string, S>;
}

export interface LiveTx<S> {
    load(): Promise<LiveRecord<S>>;
    save(next: LiveRecord<S>): Promise<void>;
    recordFacts(facts: LiveFact[]): Promise<void>;
    readAnswerDrafts(questionId: string): Promise<AnswerDraft[]>;
}

export interface AnswerDraft {
    userId: string;
    suggestion: "CORRECT" | "INCORRECT" | null;
    answeredMs: number | null;
    judged: boolean;
}

export function assertVerdictCoverage(
    drafts: AnswerDraft[],
    verdicts: Array<{ playerId: string }>,
    what: string
): void {
    const submitters = new Set(drafts.map((d) => d.userId));
    for (const v of verdicts) {
        if (!submitters.has(v.playerId)) {
            throw new RuleError("NO_ANSWER", `no submitted answer from ${v.playerId} to judge`);
        }
    }
    const staged = new Set(verdicts.map((v) => v.playerId));
    for (const d of drafts) {
        if (!d.judged && !staged.has(d.userId)) {
            throw new RuleError("UNJUDGED_ANSWERS", `judge every submitted answer before ${what}`);
        }
    }
}

export interface LiveStore<S> {
    transact<T>(fn: (tx: LiveTx<S>) => Promise<T>): Promise<T>;
}

export interface Action<S> {
    expectedVersion: number;
    transition(current: LiveRecord<S>, tx: LiveTx<S>): Transition<S> | Promise<Transition<S>>;
}

export async function mutateLive<S>(
    store: LiveStore<S>,
    transition: (current: LiveRecord<S>, tx: LiveTx<S>) => Transition<S> | Promise<Transition<S>>
): Promise<LiveRecord<S>> {
    return store.transact(async (tx) => {
        const current = await tx.load();
        const { state, facts, roundId, archive } = await transition(current, tx);
        const next: LiveRecord<S> = {
            version: nextVersion(current.version),
            roundId: roundId ?? current.roundId,
            state,
            ...(archive !== undefined
                ? { archive }
                : current.archive !== undefined
                  ? { archive: current.archive }
                  : {})
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

        const { state, facts, roundId, archive } = await action.transition(current, tx);
        const next: LiveRecord<S> = {
            version: nextVersion(current.version),
            roundId: roundId ?? current.roundId,
            state,
            ...(archive !== undefined
                ? { archive }
                : current.archive !== undefined
                  ? { archive: current.archive }
                  : {})
        };
        await tx.save(next);
        if (facts.length > 0) await tx.recordFacts(facts);
        return next;
    });
}
