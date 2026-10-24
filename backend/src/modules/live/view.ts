// What a single player should see. The shared flow (which question or window is open)
// plus that player's own private state (revealed hints, their keyword value, whether
// they may still act). Pure: the caller supplies the parsed round state and the player's
// own answer rows from the ledger.
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
import { isBuzzOpen, type VeDichState } from "../../game/engine/turns/ve-dich.js";
import { sanitizeQuestion, type SanitizedQuestion } from "../../lib/question-view.js";
import type { MatchQuestion } from "../../game/contracts/index.js";

export interface SubmittedAnswer {
    questionId: string;
    judged: boolean;
}

export interface ViewInput {
    matchId: string;
    roundId: string;
    version: number;
    now: string;
    userId: string;
    state: unknown;
    submitted: SubmittedAnswer[];
    // The match's frozen questions — the source of every payload in the view.
    // Texts and options are shown; answers never are (sanitizeQuestion).
    questions?: MatchQuestion[];
    // Caller-computed live totals (sum + display names); the view only ranks them.
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
    // the questions this player may answer right now: usually none, one, or (khoi-dong
    // phase 2) a batch
    open: Array<{ questionId: string; deadlineAt: string | null; question: SanitizedQuestion | null }>;
    // The shared live scoreboard — every screen (players and console) shows it.
    table: RankedScore[];
    // khoi-dong phase 1: the question the ACTIVE oral run is on — sent to EVERYONE
    // (decision 2310: the oral question is on every seated screen).
    oral?: {
        questionId: string;
        question: SanitizedQuestion | null;
        playerId: string;
        index: number;
        total: number;
        elapsedS: number;
        budgetS: number;
    } | null;
    // ve-dich: the board as the state knows it — free cells plus this turn's picks.
    board?: Array<{ questionId: string; domain: string; value: number; where: "free" | "pending" | "open" }>;
    me: Record<string, unknown>;
}

const plusSeconds = (iso: string, seconds: number): string =>
    new Date(Date.parse(iso) + seconds * 1000).toISOString();

// The frozen question behind an id — payload or null (never throws: a view must
// degrade to the id rather than crash a live screen).
const questionOf = (input: ViewInput, questionId: string): SanitizedQuestion | null => {
    const question = (input.questions ?? []).find((item) => item._id === questionId);
    return question ? sanitizeQuestion(question) : null;
};

// Equal points share a rank; the next rank counts positions (competition ranking).
// Exported: the routes' hand-built pending view ranks with the same function.
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

// How much of the player's own answer has been finalized for a question.
const stateOf = (submitted: SubmittedAnswer[], questionId: string): "none" | "draft" | "final" => {
    const row = submitted.find((s) => s.questionId === questionId);
    if (!row) return "none";
    return row.judged ? "final" : "draft";
};

function giaiMaView(input: ViewInput, state: GiaiMaState): PlayerView {
    const player = state.players.find((p) => p.id === input.userId);
    const open = state.openHint !== null && state.openHintAt !== null && giaiMaWindowOpen(state, input.now)
        ? [{
              questionId: state.openHint,
              deadlineAt: plusSeconds(state.openHintAt, 15),
              question: questionOf(input, state.openHint)
          }]
        : [];

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: state.stage,
        open,
        table: rankTable(input.table),
        me: {
            keywordLocked: player?.keywordLocked ?? false,
            eliminated: player?.eliminated ?? false,
            keywordValue: player ? keywordValueFor(state, input.userId) : null,
            // The hints this player unlocked — with their content, so the screen
            // can show what was revealed (G7).
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
            answerState: questionId === null ? "none" : stateOf(input.submitted, questionId)
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
            stage: "phase1",
            open: [],                                   // phase 1 is oral: nothing to type
            table: rankTable(input.table),
            // The engine tracks the run as a consumed budget (elapsedS/budgetS),
            // not a wall clock — the MC's recording drives it, so this is a bar,
            // never a fake countdown.
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
                points: khoiDongPoints(state, input.userId)
            }
        };
    }

    const questionIds = state.phase2?.questionIds ?? [];
    const closed = state.phase2?.closed ?? true;
    const open = !closed && state.phase2OpenedAt !== null
        ? questionIds.map((questionId) => ({
              questionId,
              deadlineAt: plusSeconds(state.phase2OpenedAt!, 60),
              question: questionOf(input, questionId)
          }))
        : [];

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: "phase2",
        open,
        table: rankTable(input.table),
        me: {
            points: khoiDongPoints(state, input.userId),
            answered: questionIds.filter((q) => stateOf(input.submitted, q) !== "none"),
            finalized: questionIds.filter((q) => stateOf(input.submitted, q) === "final")
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
              // the deadline is the buzz window while it is open, otherwise none
              deadlineAt: open.stage === "buzz" && state.buzzOpenedAt !== null
                  ? plusSeconds(state.buzzOpenedAt, 5)
                  : null,
              question: questionOf(input, open.question.id)
          }];

    // The board the state knows: free cells, this turn's batch, the open question.
    // Cells asked in earlier turns are gone from the state by design — the show
    // board shows what can still be played.
    const board: NonNullable<PlayerView["board"]> = [
        ...(open !== null
            ? [{
                  questionId: open.question.id,
                  domain: open.question.domain,
                  value: open.question.value,
                  where: "open" as const
              }]
            : []),
        ...state.pendingPicks
            .filter((q) => open?.question.id !== q.id)
            .map((q) => ({ questionId: q.id, domain: q.domain, value: q.value, where: "pending" as const })),
        ...state.remaining.map((q) => ({ questionId: q.id, domain: q.domain, value: q.value, where: "free" as const }))
    ];

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
            canDeclarePower: open !== null && open.stage === "current"
                && open.answerer === input.userId && open.power === null,
            canBuzz: open !== null && open.stage === "buzz" && open.buzzer === null
                && open.answerer !== input.userId && isBuzzOpen(state, input.now),
            power: open?.power ?? null,
            buzzer: open?.buzzer ?? null,
            answerState: open === null ? "none" : stateOf(input.submitted, open.question.id)
        }
    };
}

export function buildPlayerView(input: ViewInput): PlayerView {
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
