import { Type, Static } from "@sinclair/typebox";


export const GiaiMaStart = Type.Object({
    kind: Type.Literal("giai-ma.start"),
    playerIds: Type.Array(Type.String(), { minItems: 1 }),
    hintIds: Type.Array(Type.String(), { minItems: 1 })   
});

export const GiaiMaOpenHint = Type.Object({
    kind: Type.Literal("giai-ma.openHint"),
    hintId: Type.String()
});

export const GiaiMaCloseHintWindow = Type.Object({
    kind: Type.Literal("giai-ma.closeHintWindow")
});

export const GiaiMaResolveHint = Type.Object({
    kind: Type.Literal("giai-ma.resolveHint"),
    verdicts: Type.Array(Type.Object({
        playerId: Type.String(),
        correct: Type.Boolean()
    }))
});

export const GiaiMaJudgeKeyword = Type.Object({
    kind: Type.Literal("giai-ma.judgeKeyword"),
    playerId: Type.String(),
    questionId: Type.String(),                             // the keyword MatchQuestion _id
    correct: Type.Boolean()
});

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

export const ButPhaStart = Type.Object({ kind: Type.Literal("but-pha.start") });
export const ButPhaOpenQuestion = Type.Object({ kind: Type.Literal("but-pha.openQuestion") });
export const ButPhaCloseQuestion = Type.Object({ kind: Type.Literal("but-pha.closeQuestion") });
export const ButPhaEndRound = Type.Object({ kind: Type.Literal("but-pha.endRound") });

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

export const KhoiDongStart = Type.Object({
    kind: Type.Literal("khoi-dong.start"),
    phase: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2)]))
});
export const KhoiDongRecordOral = Type.Object({
    kind: Type.Literal("khoi-dong.recordOral"),
    correct: Type.Boolean(),
    spentS: Type.Number({ minimum: 0 })
});
export const KhoiDongTimeOutRun = Type.Object({ kind: Type.Literal("khoi-dong.timeOutRun") });
export const KhoiDongBeginPhase2 = Type.Object({ kind: Type.Literal("khoi-dong.beginPhase2") });
export const KhoiDongStartWindow = Type.Object({ kind: Type.Literal("khoi-dong.startWindow") });
export const KhoiDongJudge = Type.Object({
    kind: Type.Literal("khoi-dong.judge"),
    playerId: Type.String({ minLength: 1 }),
    correct: Type.Boolean()
});
export const KhoiDongNextQuestion = Type.Object({ kind: Type.Literal("khoi-dong.nextQuestion") });
export const KhoiDongEndRound = Type.Object({ kind: Type.Literal("khoi-dong.endRound") });


export const KhoiDongActionSchema = Type.Union([
    KhoiDongStart, KhoiDongRecordOral, KhoiDongTimeOutRun,
    KhoiDongBeginPhase2, KhoiDongStartWindow, KhoiDongJudge,
    KhoiDongNextQuestion, KhoiDongEndRound
]);
export type KhoiDongAction = Static<typeof KhoiDongActionSchema>;

export const VeDichStart = Type.Object({
    kind: Type.Literal("ve-dich.start"),
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
    power: Type.Union([Type.Literal("STAR"), Type.Literal("ASSIGN"), Type.Null()]),
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

export const RoundGoToAction = Type.Object({
    kind: Type.Literal("round.goTo"),
    roundId: Type.String({ minLength: 1 })
});
export type RoundGoToAction = Static<typeof RoundGoToAction>;

export const RevealAnswer = Type.Object({
    kind: Type.Literal("reveal.answer"),
    questionId: Type.String({ minLength: 1 })
});
export type RevealAnswer = Static<typeof RevealAnswer>;

export const ScoreAdjustActionSchema = Type.Object({
    kind: Type.Literal("score.adjust"),
    userId: Type.String({ minLength: 1 }),
    delta: Type.Integer({ minimum: -9999, maximum: 9999 }),
    reason: Type.String({ minLength: 1, maxLength: 200 })
});
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
    KhoiDongStartWindow,
    KhoiDongJudge,
    KhoiDongNextQuestion,
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
    VeDichPick,
    VeDichPickBatch,
    RoundGoToAction,
    RevealAnswer,
    ScoreAdjustActionSchema
]);
export type LiveAction = Static<typeof LiveActionSchema>;
