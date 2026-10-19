import { Type, Static } from "@sinclair/typebox";

// Controller-only actions: the MC drives the flow. Players only submit answers.

export const GiaiMaStart = Type.Object({
    kind: Type.Literal("giai-ma.start"),
    playerIds: Type.Array(Type.String(), { minItems: 1 }),
    hintIds: Type.Array(Type.String(), { minItems: 1 })   // hint question ids, in order
});

// Opens the answer window for one hint. Players may then submit answers for it.
export const GiaiMaOpenHint = Type.Object({
    kind: Type.Literal("giai-ma.openHint"),
    hintId: Type.String()
});

// Closes the window without resolving; the hint stays available.
export const GiaiMaCloseHintWindow = Type.Object({
    kind: Type.Literal("giai-ma.closeHintWindow")
});

// Resolves the open hint using the answers players actually submitted. The client
// sends no answers: the route loads them from the ledger.
export const GiaiMaResolveHint = Type.Object({
    kind: Type.Literal("giai-ma.resolveHint")
});

export const GiaiMaSubmitKeyword = Type.Object({
    kind: Type.Literal("giai-ma.submitKeyword"),
    playerId: Type.String(),
    questionId: Type.String(),                             // the keyword MatchQuestion _id
    correct: Type.Boolean(),
    text: Type.String()
});

export const GiaiMaEndRound = Type.Object({ kind: Type.Literal("giai-ma.endRound") });

export const GiaiMaActionSchema = Type.Union([
    GiaiMaStart,
    GiaiMaOpenHint,
    GiaiMaCloseHintWindow,
    GiaiMaResolveHint,
    GiaiMaSubmitKeyword,
    GiaiMaEndRound
]);
export type GiaiMaAction = Static<typeof GiaiMaActionSchema>;

// ── but-pha ───────────────────────────────────────────────────────────────────
// The question ids come from the match's assembled questions, resolved server-side.
export const ButPhaStart = Type.Object({ kind: Type.Literal("but-pha.start") });
export const ButPhaOpenQuestion = Type.Object({ kind: Type.Literal("but-pha.openQuestion") });
export const ButPhaCloseQuestion = Type.Object({ kind: Type.Literal("but-pha.closeQuestion") });
export const ButPhaEndRound = Type.Object({ kind: Type.Literal("but-pha.endRound") });

// The controller's final verdicts for the open question. Points are computed at this
// point, from the submission times recorded when players drafted their answers.
export const ButPhaFinalize = Type.Object({
    kind: Type.Literal("but-pha.finalize"),
    questionId: Type.String(),
    verdicts: Type.Array(
        Type.Object({ playerId: Type.String(), correct: Type.Boolean() }),
        { minItems: 1 }
    )
});

export const ButPhaActionSchema = Type.Union([
    ButPhaStart, ButPhaOpenQuestion, ButPhaCloseQuestion, ButPhaEndRound, ButPhaFinalize
]);
export type ButPhaAction = Static<typeof ButPhaActionSchema>;

// ── khoi-dong ─────────────────────────────────────────────────────────────────
// Phase 1 is oral: the MC records each verdict and the seconds spent. Phase 2 is typed:
// the player route builds the answer action, with the server's measured time.
export const KhoiDongStart = Type.Object({ kind: Type.Literal("khoi-dong.start") });
export const KhoiDongRecordOral = Type.Object({
    kind: Type.Literal("khoi-dong.recordOral"),
    correct: Type.Boolean(),
    spentS: Type.Number({ minimum: 0 })
});
export const KhoiDongTimeOutRun = Type.Object({ kind: Type.Literal("khoi-dong.timeOutRun") });
export const KhoiDongBeginPhase2 = Type.Object({ kind: Type.Literal("khoi-dong.beginPhase2") });
export const KhoiDongClosePhase2 = Type.Object({ kind: Type.Literal("khoi-dong.closePhase2") });
export const KhoiDongEndRound = Type.Object({ kind: Type.Literal("khoi-dong.endRound") });

// The controller's final verdicts for one phase-2 question's answers. The player's
// submission wrote a draft; this confirms or overwrites it and awards the points.
export const KhoiDongFinalize = Type.Object({
    kind: Type.Literal("khoi-dong.finalize"),
    questionId: Type.String(),
    verdicts: Type.Array(
        Type.Object({ playerId: Type.String(), correct: Type.Boolean() }),
        { minItems: 1 }
    )
});

export const KhoiDongActionSchema = Type.Union([
    KhoiDongStart, KhoiDongRecordOral, KhoiDongTimeOutRun,
    KhoiDongBeginPhase2, KhoiDongClosePhase2, KhoiDongEndRound, KhoiDongFinalize
]);
export type KhoiDongAction = Static<typeof KhoiDongActionSchema>;

// Round-level action: close the current round and open the next.
export const RoundAdvanceActionSchema = Type.Object({ kind: Type.Literal("round.advance") });
export type RoundAdvanceAction = Static<typeof RoundAdvanceActionSchema>;

// What a client may send: every controller action, but no server-built answer action.
export const LiveActionSchema = Type.Union([
    GiaiMaStart,
    GiaiMaOpenHint,
    GiaiMaCloseHintWindow,
    GiaiMaResolveHint,
    GiaiMaSubmitKeyword,
    GiaiMaEndRound,
    ButPhaStart,
    ButPhaOpenQuestion,
    ButPhaCloseQuestion,
    ButPhaEndRound,
    ButPhaFinalize,
    KhoiDongStart,
    KhoiDongRecordOral,
    KhoiDongTimeOutRun,
    KhoiDongBeginPhase2,
    KhoiDongClosePhase2,
    KhoiDongEndRound,
    KhoiDongFinalize,
    RoundAdvanceActionSchema
]);
export type LiveAction = Static<typeof LiveActionSchema>;
