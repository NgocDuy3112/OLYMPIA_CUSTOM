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
}

export interface PlayerView {
    matchId: string;
    roundId: string;
    version: number;
    stage: string;
    // the questions this player may answer right now: usually none, one, or (khoi-dong
    // phase 2) a batch
    open: Array<{ questionId: string; deadlineAt: string | null }>;
    me: Record<string, unknown>;
}

const plusSeconds = (iso: string, seconds: number): string =>
    new Date(Date.parse(iso) + seconds * 1000).toISOString();

// How much of the player's own answer has been finalized for a question.
const stateOf = (submitted: SubmittedAnswer[], questionId: string): "none" | "draft" | "final" => {
    const row = submitted.find((s) => s.questionId === questionId);
    if (!row) return "none";
    return row.judged ? "final" : "draft";
};

function giaiMaView(input: ViewInput, state: GiaiMaState): PlayerView {
    const player = state.players.find((p) => p.id === input.userId);
    const open = state.openHint !== null && state.openHintAt !== null && giaiMaWindowOpen(state, input.now)
        ? [{ questionId: state.openHint, deadlineAt: plusSeconds(state.openHintAt, 15) }]
        : [];

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: state.stage,
        open,
        me: {
            keywordLocked: player?.keywordLocked ?? false,
            eliminated: player?.eliminated ?? false,
            keywordValue: player ? keywordValueFor(state, input.userId) : null,
            revealedHints: player?.revealed ?? [],
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
            open = [{ questionId, deadlineAt: plusSeconds(state.questionOpenedAt, 30) }];
        }
    }

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: state.ended ? "ended" : "question",
        open,
        me: {
            points: butPhaTotal(state, input.userId),
            answerState: questionId === null ? "none" : stateOf(input.submitted, questionId)
        }
    };
}

function khoiDongView(input: ViewInput, state: KhoiDongState): PlayerView {
    if (state.stage === "phase1") {
        return {
            matchId: input.matchId,
            roundId: input.roundId,
            version: input.version,
            stage: "phase1",
            open: [],                                   // phase 1 is oral: nothing to type
            me: {
                isMyRun: activePlayerId(state) === input.userId,
                points: khoiDongPoints(state, input.userId)
            }
        };
    }

    const questionIds = state.phase2?.questionIds ?? [];
    const closed = state.phase2?.closed ?? true;
    const open = !closed && state.phase2OpenedAt !== null
        ? questionIds.map((questionId) => ({
              questionId,
              deadlineAt: plusSeconds(state.phase2OpenedAt!, 60)
          }))
        : [];

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: "phase2",
        open,
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
                  : null
          }];

    const isMyTurn = !state.ended && open === null
        && state.players[state.turnIndex]?.id === input.userId;

    return {
        matchId: input.matchId,
        roundId: input.roundId,
        version: input.version,
        stage: state.ended ? "ended" : `phase${state.phase}`,
        open: openList,
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
                me: {}
            };
    }
}
