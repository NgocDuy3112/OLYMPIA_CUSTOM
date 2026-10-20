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

// ── ve-dich ───────────────────────────────────────────────────────────────────
// Controller actions drive the phases; players pick, declare powers, and buzz. Those
// arrive as server-built actions, never from a client claiming a playerId.
export const VeDichStart = Type.Object({ kind: Type.Literal("ve-dich.start") });
export const VeDichBeginPhase2 = Type.Object({ kind: Type.Literal("ve-dich.beginPhase2") });
export const VeDichOpenQuestion = Type.Object({
    kind: Type.Literal("ve-dich.openQuestion"),
    questionId: Type.String()
});
export const VeDichCloseCurrentAnswer = Type.Object({
    kind: Type.Literal("ve-dich.closeCurrentAnswer")
});
export const VeDichResolve = Type.Object({
    kind: Type.Literal("ve-dich.resolve"),
    answerer: Type.Boolean(),
    buzzer: Type.Optional(Type.Boolean())
});
export const VeDichAdvanceTurn = Type.Object({ kind: Type.Literal("ve-dich.advanceTurn") });
export const VeDichEndRound = Type.Object({ kind: Type.Literal("ve-dich.endRound") });

export const VeDichPick = Type.Object({
    kind: Type.Literal("ve-dich.pick"),
    playerId: Type.String(),
    questionId: Type.String()
});
export const VeDichPickBatch = Type.Object({
    kind: Type.Literal("ve-dich.pickBatch"),
    playerId: Type.String(),
    questionIds: Type.Array(Type.String(), { minItems: 3, maxItems: 3 })
});
export const VeDichDeclarePower = Type.Object({
    kind: Type.Literal("ve-dich.declarePower"),
    playerId: Type.String(),
    power: Type.Union([Type.Literal("HOPE"), Type.Literal("SHIELD")])
});
export const VeDichBuzz = Type.Object({
    kind: Type.Literal("ve-dich.buzz"),
    playerId: Type.String()
});

export const VeDichActionSchema = Type.Union([
    VeDichStart, VeDichBeginPhase2, VeDichOpenQuestion, VeDichCloseCurrentAnswer,
    VeDichResolve, VeDichAdvanceTurn, VeDichEndRound,
    VeDichPick, VeDichPickBatch, VeDichDeclarePower, VeDichBuzz
]);
export type VeDichAction = Static<typeof VeDichActionSchema>;

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
    VeDichStart,
    VeDichBeginPhase2,
    VeDichOpenQuestion,
    VeDichCloseCurrentAnswer,
    VeDichResolve,
    VeDichAdvanceTurn,
    VeDichEndRound,
    RoundAdvanceActionSchema
]);
export type LiveAction = Static<typeof LiveActionSchema>;
