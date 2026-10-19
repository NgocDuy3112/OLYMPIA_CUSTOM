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

export function buildPlayerView(input: ViewInput): PlayerView {
    switch (input.roundId) {
        case "giai-ma":
            return giaiMaView(input, input.state as GiaiMaState);
        case "but-pha":
            return butPhaView(input, input.state as ButPhaState);
        case "khoi-dong":
            return khoiDongView(input, input.state as KhoiDongState);
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
