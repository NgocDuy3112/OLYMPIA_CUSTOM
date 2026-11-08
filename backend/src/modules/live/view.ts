import {
    isWindowOpen as giaiMaWindowOpen,
    keywordValueFor,
    type GiaiMaState
} from "../../game/engine/turns/giai-ma.js";
import {
    elapsedSeconds,
    openQuestionId,
    butPhaTotal,
    type ButPhaState
} from "../../game/engine/turns/but-pha.js";
import {
    activePlayerId,
    khoiDongPoints,
    type KhoiDongState
} from "../../game/engine/turns/khoi-dong-round.js";
import { isBuzzOpen, mayBuzz, type VeDichState } from "../../game/engine/turns/ve-dich.js";
import { isPhase2WindowOpen, phase2QuestionId } from "../../game/engine/turns/khoi-dong.js";
import { sanitizeQuestion, answerDisplayOf, type SanitizedQuestion } from "../../lib/question-view.js";
import type { MatchQuestion } from "../../game/contracts/index.js";

export interface SubmittedAnswer {
    questionId: string;
    judged: boolean;
    verdict: "CORRECT" | "INCORRECT" | null;
}

const PUBLISHES_VERDICTS = new Set(["khoi-dong", "but-pha", "ve-dich"]);

export interface ViewInput {
    matchId: string;
    roundId: string;
    version: number;
    now: string;
    userId: string;
    state: unknown;
    submitted: SubmittedAnswer[];
    judged?: Array<{ questionId: string; userId: string; verdict: "CORRECT" | "INCORRECT" | null }>;
    questions?: MatchQuestion[];
    table?: ScoreRow[];
}

export interface ScoreRow {
    id: string;
    displayName: string;
    points: number;
}
export type RankedScore = ScoreRow & { rank: number };

export interface PlayerView {
    matchId: string;
    roundId: string;
    version: number;
    stage: string;
    open: Array<{ questionId: string; deadlineAt: string | null; question: SanitizedQuestion | null }>;
    table: RankedScore[];
    oral?: {
        questionId: string;
        question: SanitizedQuestion | null;
        playerId: string;
        index: number;
        total: number;
        elapsedS: number;
        budgetS: number;
    } | null;
    board?: Array<{ questionId: string; value: number; where: "free" | "pending" | "open" | "taken" | "deferred" }>;
    keyword?: { questionId: string; question: SanitizedQuestion | null } | null;
    publicVerdicts?: Array<{
        questionId: string;
        userId: string;
        verdict: "CORRECT" | "INCORRECT";
    }>;
    audioGate?: { allowed: string[] };
    revealed?: { questionId: string; answer: string };
    me: Record<string, unknown>;
}

const plusSeconds = (iso: string, seconds: number): string =>
    new Date(Date.parse(iso) + seconds * 1000).toISOString();

const questionOf = (input: ViewInput, questionId: string): SanitizedQuestion | null => {
    const question = (input.questions ?? []).find((item) => item._id === questionId);
    return question ? sanitizeQuestion(question) : null;
};

export const rankTable = (table: ScoreRow[] = []): RankedScore[] => {
    const sorted = [...table].sort((a, b) => b.points - a.points);
    let rank = 0;
    let lastPoints: number | null = null;
    return sorted.map((row, index) => {
        if (row.points !== lastPoints) {
            rank = index + 1;
            lastPoints = row.points;
        }
        return { ...row, rank };
    });
};

const stateOf = (submitted: SubmittedAnswer[], questionId: string): "none" | "draft" | "final" => {
    const row = submitted.find((s) => s.questionId === questionId);
    if (!row) return "none";
    return row.judged ? "final" : "draft";
};

const verdictsOf = (submitted: SubmittedAnswer[]): Record<string, "CORRECT" | "INCORRECT"> =>
    Object.fromEntries(
        submitted
            .filter((row): row is SubmittedAnswer & { verdict: "CORRECT" | "INCORRECT" } =>
                row.verdict !== null && row.verdict !== undefined)
            .map((row) => [row.questionId, row.verdict])
    );

function giaiMaView(input: ViewInput, state: GiaiMaState): PlayerView {
    const player = state.players.find((p) => p.id === input.userId);
    const open = state.openHint !== null && state.openHintAt !== null && giaiMaWindowOpen(state, input.now)
        ? [{
              questionId: state.openHint,
              deadlineAt: plusSeconds(state.openHintAt, 15),
              question: questionOf(input, state.openHint)
          }]
        : [];

    const keywordQuestion = (input.questions ?? []).find((q) => q.kind === "KEYWORD");

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: state.stage,
        open,
        keyword: keywordQuestion
            ? { questionId: keywordQuestion._id, question: sanitizeQuestion(keywordQuestion) }
            : null,
        table: rankTable(input.table),
        me: {
            verdicts: verdictsOf(input.submitted),
            keywordLocked: player?.keywordLocked ?? false,
            eliminated: player?.eliminated ?? false,
            keywordValue: player ? keywordValueFor(state, input.userId) : null,
            revealedHints: (player?.revealed ?? []).map((questionId) => ({
                questionId,
                question: questionOf(input, questionId)
            })),
            hintsRevealed: player?.hintsRevealed ?? 0,
            answerState: open.length > 0 ? stateOf(input.submitted, open[0].questionId) : "none"
        }
    };
}

function butPhaView(input: ViewInput, state: ButPhaState): PlayerView {
    const questionId = openQuestionId(state);
    let open: PlayerView["open"] = [];

    if (questionId !== null && state.questionOpenedAt !== null) {
        let atS: number;
        try {
            atS = elapsedSeconds(state, input.now);
        } catch {
            atS = Number.POSITIVE_INFINITY;
        }
        if (atS <= 30) {
            open = [{
                questionId,
                deadlineAt: plusSeconds(state.questionOpenedAt, 30),
                question: questionOf(input, questionId)
            }];
        }
    }

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: state.ended ? "ended" : "question",
        open,
        table: rankTable(input.table),
        me: {
            points: butPhaTotal(state, input.userId),
            answerState: questionId === null ? "none" : stateOf(input.submitted, questionId),
            verdicts: verdictsOf(input.submitted)
        }
    };
}

function khoiDongView(input: ViewInput, state: KhoiDongState): PlayerView {
    if (state.stage === "phase1") {
        const activeId = activePlayerId(state);
        const run = activeId !== null ? state.runs[activeId] : null;
        const currentId = run && !run.ended && run.cursor < run.questionIds.length
            ? run.questionIds[run.cursor]
            : null;
        return {
            matchId: input.matchId,
            roundId: input.roundId,
            version: input.version,
            stage: state.ended ? "ended" : "phase1",
            open: [],                                   // phase 1 is oral: nothing to type
            table: rankTable(input.table),
            oral: run && currentId !== null
                ? {
                      questionId: currentId,
                      question: questionOf(input, currentId),
                      playerId: activeId!,
                      index: run.cursor,
                      total: run.questionIds.length,
                      elapsedS: run.elapsedS,
                      budgetS: run.budgetS
                  }
                : null,
            me: {
                isMyRun: activeId === input.userId,
                points: khoiDongPoints(state, input.userId),
                verdicts: verdictsOf(input.submitted)
            }
        };
    }

    const p2 = state.phase2;
    const questionId = p2 === null ? null : phase2QuestionId(p2);
    const windowOpen = p2 !== null && isPhase2WindowOpen(p2, input.now);

    const open: PlayerView["open"] = questionId === null || p2 === null
        ? []
        : [{
              questionId,
              deadlineAt: p2.openedAt === null ? null : plusSeconds(p2.openedAt, p2.windowS),
              question: questionOf(input, questionId)
          }];

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: state.ended ? "ended" : "phase2",
        open,
        table: rankTable(input.table),
        me: {
            points: khoiDongPoints(state, input.userId),
            answerState: questionId === null ? "none" : stateOf(input.submitted, questionId),
            windowOpen,
            questionIndex: p2?.index ?? 0,
            questionCount: p2?.questionIds.length ?? 0,
            verdicts: verdictsOf(input.submitted)
        }
    };
}

function veDichView(input: ViewInput, state: VeDichState): PlayerView {
    const player = state.players.find((p) => p.id === input.userId);
    const open = state.open;

    const openList: PlayerView["open"] = open === null
        ? []
        : [{
              questionId: open.question.id,
              deadlineAt: open.stage === "buzz" && state.buzzOpenedAt !== null
                  ? plusSeconds(state.buzzOpenedAt, 5)
                  : null,
              question: questionOf(input, open.question.id)
          }];

    const openId = open?.question.id ?? null;
    const pendingIds = new Set(state.pendingPicks.map((q) => q.id));
    const freeIds = new Set(state.remaining.map((q) => q.id));
    const deferredIds = new Set((state.deferred ?? []).map((q) => q.id));
    const board: NonNullable<PlayerView["board"]> = (input.questions ?? [])
        .filter((q) => q.roundId === "ve-dich")
        .map((q) => {
            const where =
                q._id === openId ? "open" as const
                : pendingIds.has(q._id) ? "pending" as const
                : freeIds.has(q._id) ? "free" as const
                : deferredIds.has(q._id) || (state.phase === 1 && q.points > 30) ? "deferred" as const
                : "taken" as const;
            return { questionId: q._id, value: q.points, where };
        });

    const audioGate =
        state.phase !== 2 || open === null
            ? null
            : {
                  allowed: [
                      ...new Set(
                          [open.answerer, open.assignedTo ?? null, open.buzzer ?? null].filter(
                              (id): id is string => Boolean(id)
                          )
                      ),
                  ],
              };

    const isMyTurn = !state.ended && open === null
        && state.players[state.turnIndex]?.id === input.userId;

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: state.ended ? "ended" : `phase${state.phase}`,
        open: openList,
        table: rankTable(input.table),
        board,
        me: {
            score: player?.score ?? 0,
            powersLeft: player?.powersLeft ?? [],
            isMyTurn,
            pendingPicks: state.pendingPicks.map((q) => q.id),
            isAnswerer: open?.answerer === input.userId,
            canAnswer: open !== null && open.stage === "current" && open.answerer === input.userId,
            canBuzz: open !== null && open.stage === "buzz" && open.buzzer === null
                && mayBuzz(state, input.userId) && isBuzzOpen(state, input.now),
            power: open?.power ?? null,
            buzzer: open?.buzzer ?? null,
            buzzerMs: open?.buzzerMs ?? null,
            answerState: open === null ? "none" : stateOf(input.submitted, open.question.id),
            verdicts: verdictsOf(input.submitted)
        },
        ...(audioGate ? { audioGate } : {})
    };
}

export function buildPlayerView(input: ViewInput): PlayerView {
    const view = withReveal(input, roundViewOf(input));
    if (!PUBLISHES_VERDICTS.has(input.roundId)) return view;
    const judged = (input.judged ?? []).filter((row) => row.verdict !== null);
    return judged.length === 0 ? view : {
        ...view,
        publicVerdicts: judged.map((row) => ({
            questionId: row.questionId,
            userId: row.userId,
            verdict: row.verdict as "CORRECT" | "INCORRECT"
        }))
    };
}

function withReveal(input: ViewInput, view: PlayerView): PlayerView {
    const marker = input.state as { revealedAnswer?: string | null } | null | undefined;
    const questionId = marker?.revealedAnswer;
    if (!questionId) return view;

    let stillShowing = false;
    switch (input.roundId) {
        case "khoi-dong": {
            const state = input.state as KhoiDongState;
            if (state.stage === "phase2") {
                stillShowing = state.phase2 !== null && phase2QuestionId(state.phase2) === questionId;
                break;
            }
            const activeId = activePlayerId(state);
            const run = activeId !== null ? state.runs[activeId] : null;
            stillShowing = run !== null && !run.ended
                && run.cursor < run.questionIds.length
                && run.questionIds[run.cursor] === questionId;
            break;
        }
        case "but-pha":
            stillShowing = openQuestionId(input.state as ButPhaState) === questionId;
            break;
        case "ve-dich":
            stillShowing = (input.state as VeDichState).open?.question.id === questionId;
            break;
        case "giai-ma": {
            const state = input.state as GiaiMaState;
            const keywordId = (input.questions ?? []).find((q) => q.kind === "KEYWORD")?._id;
            const currentHint = state.openHint ?? state.picked.at(-1);
            stillShowing = questionId === keywordId
                || (currentHint !== undefined && currentHint === questionId);
            break;
        }
        default:
            stillShowing = false;
    }
    if (!stillShowing) return view;

    const question = (input.questions ?? []).find((item) => item._id === questionId);
    const answer = question ? answerDisplayOf(question) : null;
    return answer === null ? view : { ...view, revealed: { questionId, answer } };
}

function roundViewOf(input: ViewInput): PlayerView {
    switch (input.roundId) {
        case "giai-ma":
            return giaiMaView(input, input.state as GiaiMaState);
        case "but-pha":
            return butPhaView(input, input.state as ButPhaState);
        case "khoi-dong":
            return khoiDongView(input, input.state as KhoiDongState);
        case "ve-dich":
            return veDichView(input, input.state as VeDichState);
        default:
            return {
                matchId: input.matchId,
                roundId: input.roundId,
                version: input.version,
                stage: "unknown",
                open: [],
                table: rankTable(input.table),
                me: {}
            };
    }
}
