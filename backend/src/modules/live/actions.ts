import { Type, Static } from "@sinclair/typebox";

// Controller-only actions: the console drives the flow. Players only submit answers.

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

// Resolves the open hint with the console's EXPLICIT verdicts — one per submitted
// answer (staged in the console). Nothing may be omitted: the route refuses
// when a submitted answer has no verdict, and each verdict judges that draft
// row as the reveal happens.
export const GiaiMaResolveHint = Type.Object({
    kind: Type.Literal("giai-ma.resolveHint"),
    verdicts: Type.Array(Type.Object({
        playerId: Type.String(),
        correct: Type.Boolean()
    }))
});

// The the console's verdict on a player's submitted (drafted, locked) keyword. The typed
// text lives in the answers ledger — this action only judges the row that is
// already there, so it can never invent a submission.
export const GiaiMaJudgeKeyword = Type.Object({
    kind: Type.Literal("giai-ma.judgeKeyword"),
    playerId: Type.String(),
    questionId: Type.String(),                             // the keyword MatchQuestion _id
    correct: Type.Boolean()
});

// The keyword submission: locks participation and stores the typed text as a
// DRAFT — it carries NO verdict; the console judges later via giai-ma.judgeKeyword.
// Built by the submit path from the keyword command (the player's door) and
// also accepted from the wire (the console may enter one on a player's behalf) —
// either way: lock + draft, never a verdict.
export const GiaiMaSubmitKeyword = Type.Object({
    kind: Type.Literal("giai-ma.submitKeyword"),
    playerId: Type.String(),
    questionId: Type.String(),                             // the keyword MatchQuestion _id
    text: Type.String(),
    suggestion: Type.Union([Type.Literal("CORRECT"), Type.Literal("INCORRECT")])
});

export const GiaiMaEndRound = Type.Object({ kind: Type.Literal("giai-ma.endRound") });

export const GiaiMaActionSchema = Type.Union([
    GiaiMaStart,
    GiaiMaOpenHint,
    GiaiMaCloseHintWindow,
    GiaiMaResolveHint,
    GiaiMaSubmitKeyword,
    GiaiMaJudgeKeyword,
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
// Phase 1 is oral: the console records each verdict and the seconds spent. Phase 2 is typed:
// the player route builds the answer action, with the server's measured time.
export const KhoiDongStart = Type.Object({
    kind: Type.Literal("khoi-dong.start"),
    /** 2 = start straight at Chung: untouched phase 1 is skipped (no oral points). */
    phase: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2)]))
});
export const KhoiDongRecordOral = Type.Object({
    kind: Type.Literal("khoi-dong.recordOral"),
    correct: Type.Boolean(),
    spentS: Type.Number({ minimum: 0 })
});
export const KhoiDongTimeOutRun = Type.Object({ kind: Type.Literal("khoi-dong.timeOutRun") });
export const KhoiDongBeginPhase2 = Type.Object({ kind: Type.Literal("khoi-dong.beginPhase2") });
// The operator opens EVERY window — the first attempt and the re-buzz.
export const KhoiDongOpenBuzz = Type.Object({ kind: Type.Literal("khoi-dong.openBuzz") });
// The verdict on the buzzed answer: +10 on the first chance, +5 on the second.
export const KhoiDongJudgeBuzz = Type.Object({
    kind: Type.Literal("khoi-dong.judgeBuzz"),
    correct: Type.Boolean()
});
// Move on: nobody buzzed, or the question is done.
export const KhoiDongNextQuestion = Type.Object({ kind: Type.Literal("khoi-dong.nextQuestion") });
export const KhoiDongClosePhase2 = Type.Object({ kind: Type.Literal("khoi-dong.closePhase2") });
export const KhoiDongEndRound = Type.Object({ kind: Type.Literal("khoi-dong.endRound") });

// The controller's final verdicts for one phase-2 question's answers. The player's
// submission wrote a draft; this confirms or overwrites it and awards the points.

export const KhoiDongActionSchema = Type.Union([
    KhoiDongStart, KhoiDongRecordOral, KhoiDongTimeOutRun,
    KhoiDongBeginPhase2, KhoiDongOpenBuzz, KhoiDongJudgeBuzz, KhoiDongNextQuestion,
    KhoiDongClosePhase2, KhoiDongEndRound
]);
export type KhoiDongAction = Static<typeof KhoiDongActionSchema>;

// ── ve-dich ───────────────────────────────────────────────────────────────────
// Controller actions drive the phases; players pick, declare powers, and buzz. Those
// arrive as server-built actions, never from a client claiming a playerId.
export const VeDichStart = Type.Object({
    kind: Type.Literal("ve-dich.start"),
    /** 2 = start straight at Riêng: the summit runs on untouched scores. */
    phase: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2)]))
});
export const VeDichBeginPhase2 = Type.Object({ kind: Type.Literal("ve-dich.beginPhase2") });
export const VeDichOpenQuestion = Type.Object({
    kind: Type.Literal("ve-dich.openQuestion"),
    questionId: Type.String()
});
export const VeDichCloseCurrentAnswer = Type.Object({
    kind: Type.Literal("ve-dich.closeCurrentAnswer")
});
// The operator ends the race: the clock stops and both halves of a duel are
// locked out. Nothing is scored here — the resolve then reports "nobody buzzed".
export const VeDichLockBuzz = Type.Object({
    kind: Type.Literal("ve-dich.lockBuzz")
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
    power: Type.Union([Type.Literal("STAR"), Type.Literal("ASSIGN")]),
    // ASSIGN hands the question to someone: required for it, ignored otherwise.
    targetId: Type.Optional(Type.String())
});
export const VeDichBuzz = Type.Object({
    kind: Type.Literal("ve-dich.buzz"),
    playerId: Type.String()
});

export const VeDichActionSchema = Type.Union([
    VeDichStart, VeDichBeginPhase2, VeDichOpenQuestion, VeDichCloseCurrentAnswer, VeDichLockBuzz,
    VeDichResolve, VeDichAdvanceTurn, VeDichEndRound,
    VeDichPick, VeDichPickBatch, VeDichDeclarePower, VeDichBuzz
]);
export type VeDichAction = Static<typeof VeDichActionSchema>;

// Round-level navigation: make ANY round the active one. The current round's
// state is archived and the target's saved state (if any) is restored — the
// controller may re-visit finished or mid-play rounds (no one-way doors).
export const RoundGoToAction = Type.Object({
    kind: Type.Literal("round.goTo"),
    roundId: Type.String({ minLength: 1 })
});
export type RoundGoToAction = Static<typeof RoundGoToAction>;

// Match-level score correction — NOT bound to a round (handled like round.goTo,
// before the round guard): the controller's audited delta lands in the
// score_adjustments ledger and folds into the scoreboard and final results.
export const ScoreAdjustActionSchema = Type.Object({
    kind: Type.Literal("score.adjust"),
    userId: Type.String({ minLength: 1 }),
    delta: Type.Integer({ minimum: -9999, maximum: 9999 }),
    reason: Type.String({ minLength: 1, maxLength: 200 })
});
// What a client may send: every controller action, but no server-built answer action.
// Exception: ve-dich.declarePower — the console declares powers for the player
// whose turn it is (the show deck is the operator's), so the door is open for it
// too; the engine still enforces NOT_YOUR_TURN / INVALID_TARGET on the claim.
export const LiveActionSchema = Type.Union([
    GiaiMaStart,
    GiaiMaOpenHint,
    GiaiMaCloseHintWindow,
    GiaiMaResolveHint,
    GiaiMaSubmitKeyword,
    GiaiMaJudgeKeyword,
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
    KhoiDongOpenBuzz,
    KhoiDongJudgeBuzz,
    KhoiDongNextQuestion,
    KhoiDongClosePhase2,
    KhoiDongEndRound,
    VeDichStart,
    VeDichBeginPhase2,
    VeDichOpenQuestion,
    VeDichCloseCurrentAnswer,
    VeDichLockBuzz,
    VeDichResolve,
    VeDichAdvanceTurn,
    VeDichEndRound,
    VeDichDeclarePower,
    RoundGoToAction,
    ScoreAdjustActionSchema
]);
export type LiveAction = Static<typeof LiveActionSchema>;
