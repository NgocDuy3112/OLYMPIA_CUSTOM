// One place that turns a player's submitted answer into a recorded fact, whatever the
// transport. The HTTP route and the WebSocket handler both call this, so seat checks,
// window checks, auto-match, and the write happen exactly once.
import { Value } from "@sinclair/typebox/value";
import {
    SubmittedAnswerValueSchema,
    type SubmittedAnswerValue
} from "../../game/contracts/index.js";
import { getMatchById } from "../matches/service.js";
import { isSeatedInMatch } from "../matches/seats.js";
import { audit } from "../audit/service.js";
import { autoMatch, type QuestionKind } from "../../game/engine/matching.js";
import { RuleError } from "../../game/engine/turns/errors.js";
import {
    canPlayerAnswer,
    isWindowOpen
} from "../../game/engine/turns/giai-ma.js";
import { elapsedSeconds, openQuestionId } from "../../game/engine/turns/but-pha.js";

import { elapsedPhase2Seconds, phase2Budget } from "../../game/engine/turns/khoi-dong-round.js";
import { giaiMaRules } from "../../game/engine/rules.js";
import type { RoundConfig } from "../../game/contracts/index.js";
import { applyGiaiMaAction } from "./giai-ma.js";
import { mutateLive, type Transition } from "./apply.js";
import { publish } from "./hub.js";
import { pgLiveStore, readLive, writeDraft } from "./store.js";
import { parseButPhaState, parseGiaiMaState, parseKhoiDongState, parseVeDichState } from "./state.js";

export type Suggestion = "CORRECT" | "INCORRECT";

// What every submission ack returns: "received, awaiting the MC's verdict".
// Nothing about correctness crosses the wire — the auto-matcher's opinion stays
// server-side in the draft (drafts.auto) for the MC to review; the player waits
// for the verdict the console pushes after judging.
export type AnswerResult = { drafted: true };

// A refusal the caller can turn into an HTTP status, or a socket error message.
export class SubmitError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = "SubmitError";
    }
}

export interface SubmitContext {
    matchId: string;
    userId: string;
    questionId: string;
    value: unknown;
    ip?: string | null;
    userAgent?: string | null;
}

const draftAudit = async (ctx: SubmitContext, roundId: string, suggestion: Suggestion) => {
    await audit({
        action: "answer_drafted",
        actorId: null,                       // the auto-matcher drafted it, not a person
        matchId: ctx.matchId,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        details: { roundId, questionId: ctx.questionId, userId: ctx.userId, suggestion }
    });
};

export async function loadContext(ctx: SubmitContext) {
    const match = await getMatchById(ctx.matchId);
    if (match.status !== "LIVE") throw new SubmitError(409, "NOT_LIVE", "match is not LIVE");
    if (!isSeatedInMatch(match.players, ctx.userId)) {
        throw new SubmitError(403, "NOT_SEATED", "you are not a player in this match");
    }

    const live = await readLive(ctx.matchId);
    if (!live) throw new SubmitError(404, "NO_ROUND", "no live round");
    if (!live.state || Object.keys(live.state).length === 0) {
        throw new SubmitError(409, "NOT_STARTED", `round ${live.roundId} has not started`);
    }

    return { match, live, now: new Date().toISOString() };
}

function parseValue(value: unknown): SubmittedAnswerValue {
    if (!Value.Check(SubmittedAnswerValueSchema, value)) {
        throw new SubmitError(400, "BAD_VALUE", "invalid answer value");
    }
    return value as SubmittedAnswerValue;
}

// A player's answer for the round in play. giai-ma hints are recorded outright; the typed
// rounds produce a draft that the controller finalizes.
export async function submitAnswer(ctx: SubmitContext): Promise<AnswerResult> {
    const value = parseValue(ctx.value);
    const { match, live, now } = await loadContext(ctx);

    if (live.roundId === "giai-ma") {
        const state = parseGiaiMaState(live.state);
        if (state.openHint !== ctx.questionId) {
            throw new SubmitError(409, "NO_WINDOW", "no answer window is open for this question");
        }
        if (!isWindowOpen(state, now)) {
            throw new SubmitError(409, "WINDOW_CLOSED", "the answer window has closed");
        }
        if (!canPlayerAnswer(state, ctx.userId, now)) {
            throw new SubmitError(409, "LOCKED", "you can no longer answer this round");
        }

        const question = match.questions.find((q) => q._id === ctx.questionId);
        if (!question) throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");

        // A hint answer is a DRAFT: the auto-matcher's opinion is stored for the
        // MC, the reveal resolves it (giai-ma.resolveHint judges every row).
        // Revision while the window is open: last answer wins (writeDraft default).
        const suggestion: Suggestion = autoMatch(question.kind as QuestionKind, question.payload, value)
            ? "CORRECT" : "INCORRECT";
        await writeDraft({
            matchId: ctx.matchId,
            questionId: ctx.questionId,
            userId: ctx.userId,
            value,
            suggestion
        });
        await draftAudit(ctx, live.roundId, suggestion);

        await publish(ctx.matchId);
        return { drafted: true };
    }

    if (live.roundId === "but-pha") {
        if (!("text" in value)) {
            throw new SubmitError(400, "BAD_VALUE", "a but-pha answer must be text");
        }
        const state = parseButPhaState(live.state);
        const openId = openQuestionId(state);
        if (openId === null) throw new SubmitError(409, "NO_QUESTION", "no question is open");
        if (openId !== ctx.questionId) {
            throw new SubmitError(409, "NOT_OPEN", "that question is not open");
        }

        let atS: number;
        try {
            atS = elapsedSeconds(state, now);
        } catch {
            throw new SubmitError(409, "NO_CLOCK", "the question's clock has not started");
        }
        if (atS > state.rules.questionLimitS) {
            throw new SubmitError(409, "WINDOW_CLOSED", "the answer window has closed");
        }

        const question = match.questions.find((q) => q._id === openId);
        if (!question) throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");

        const suggestion: Suggestion = autoMatch(question.kind as QuestionKind, question.payload, value)
            ? "CORRECT" : "INCORRECT";

        await writeDraft({
            matchId: ctx.matchId,
            questionId: openId,
            userId: ctx.userId,
            value,
            suggestion,
            answeredMs: Math.round(atS * 1000),
            revise: false                       // but-pha allows one attempt per question
        });
        await draftAudit(ctx, live.roundId, suggestion);
        await publish(ctx.matchId);
        return { drafted: true };
    }

    if (live.roundId === "khoi-dong") {
        if (!("text" in value)) {
            throw new SubmitError(400, "BAD_VALUE", "a khoi-dong phase-2 answer must be text");
        }
        const state = parseKhoiDongState(live.state);
        if (state.ended) throw new SubmitError(409, "ENDED", "the round has ended");
        if (state.stage !== "phase2" || state.phase2 === null) {
            throw new SubmitError(409, "PHASE_CLOSED", "phase 2 is not open");
        }
        if (state.phase2.closed) throw new SubmitError(409, "PHASE_CLOSED", "phase 2 is closed");
        if (!state.phase2.questionIds.includes(ctx.questionId)) {
            throw new SubmitError(409, "NOT_IN_PHASE", "that question is not in phase 2");
        }

        let atS: number;
        try {
            atS = elapsedPhase2Seconds(state, now);
        } catch {
            throw new SubmitError(409, "NO_CLOCK", "phase 2's clock has not started");
        }
        if (atS > phase2Budget(state)) {
            throw new SubmitError(409, "WINDOW_CLOSED", "the answer window has closed");
        }

        const question = match.questions.find((q) => q._id === ctx.questionId);
        if (!question) throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");

        const suggestion: Suggestion = autoMatch(question.kind as QuestionKind, question.payload, value)
            ? "CORRECT" : "INCORRECT";

        await writeDraft({
            matchId: ctx.matchId,
            questionId: ctx.questionId,
            userId: ctx.userId,
            value,
            suggestion
        });
        await draftAudit(ctx, live.roundId, suggestion);
        await publish(ctx.matchId);
        return { drafted: true };
    }

    if (live.roundId === "ve-dich") {
        if (!("text" in value)) {
            throw new SubmitError(400, "BAD_VALUE", "a ve-dich phase-1 answer must be text");
        }
        const state = parseVeDichState(live.state);
        if (state.ended) throw new SubmitError(409, "ENDED", "the round has ended");
        if (state.phase !== 1) throw new SubmitError(409, "PHASE_CLOSED", "phase 1 is over");

        const open = state.open;
        if (open === null || open.question.id !== ctx.questionId) {
            throw new SubmitError(409, "NOT_OPEN", "that question is not open");
        }
        if (open.answerer !== ctx.userId) {
            throw new SubmitError(409, "NOT_YOUR_TURN", "you are not answering this question");
        }
        if (open.stage !== "current") {
            throw new SubmitError(409, "WINDOW_CLOSED", "the answer window has closed");
        }

        const question = match.questions.find((q) => q._id === open.question.id);
        if (!question) throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");

        const suggestion: Suggestion = autoMatch(question.kind as QuestionKind, question.payload, value)
            ? "CORRECT" : "INCORRECT";

        await writeDraft({
            matchId: ctx.matchId,
            questionId: open.question.id,
            userId: ctx.userId,
            value,
            suggestion
        });
        await draftAudit(ctx, live.roundId, suggestion);
        await publish(ctx.matchId);
        return { drafted: true };
    }

    throw new SubmitError(409, "NO_ROUND", `round ${live.roundId} does not accept answers yet`);
}

// The giai-ma keyword. Unlike a hint answer this changes round state: the player is
// locked out of hints. The typed text is stored as a DRAFT — no verdict, no points
// until the MC judges (giai-ma.judgeKeyword).
export async function submitKeyword(ctx: SubmitContext): Promise<AnswerResult> {
    const value = parseValue(ctx.value);
    if (!("text" in value)) throw new SubmitError(400, "BAD_VALUE", "a keyword answer must be text");

    const { match, live } = await loadContext(ctx);
    if (live.roundId !== "giai-ma") {
        throw new SubmitError(409, "NO_KEYWORD", `round ${live.roundId} has no keyword submission`);
    }

    const keyword = match.questions.find((q) => q.kind === "KEYWORD" && q.roundId === live.roundId);
    if (!keyword) throw new SubmitError(400, "NO_KEYWORD", "this round has no keyword question");
    if (keyword._id !== ctx.questionId) {
        throw new SubmitError(400, "NOT_KEYWORD", "question is not this round's keyword");
    }

    const suggestion: Suggestion = autoMatch("KEYWORD", keyword.payload, value)
        ? "CORRECT" : "INCORRECT";

    await mutateLive(
        pgLiveStore<Record<string, unknown>>(ctx.matchId),
        (current): Transition<Record<string, unknown>> => {
            const state = parseGiaiMaState(current.state);
            if (state.players.find((p) => p.id === ctx.userId)?.keywordLocked) {
                throw new RuleError("ALREADY_SUBMITTED", "you already submitted a keyword");
            }
            const { state: nextState, facts } = applyGiaiMaAction(
                state,
                {
                    kind: "giai-ma.submitKeyword",
                    playerId: ctx.userId,
                    questionId: keyword._id,
                    text: value.text,
                    suggestion           // the matcher's OPINION — stored in the draft, never a verdict
                },
                {
                    actorId: ctx.userId,
                    roundId: current.roundId,
                    hintTurnId: "",
                    answerDrafts: [],                    // lock+draft only — nothing to read for resolve
                    now: new Date().toISOString(),
                    rules: giaiMaRules((match as { roundConfigs?: Record<string, RoundConfig> }).roundConfigs?.[current.roundId])
                }
            );
            return { state: nextState as unknown as Record<string, unknown>, facts };
        }
    );

    await publish(ctx.matchId);
    return { drafted: true };
}
