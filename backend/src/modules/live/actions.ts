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

// Round-level action: close the current round and open the next.
export const RoundAdvanceActionSchema = Type.Object({ kind: Type.Literal("round.advance") });
export type RoundAdvanceAction = Static<typeof RoundAdvanceActionSchema>;

export const LiveActionSchema = Type.Union([
    GiaiMaStart,
    GiaiMaOpenHint,
    GiaiMaCloseHintWindow,
    GiaiMaResolveHint,
    GiaiMaSubmitKeyword,
    GiaiMaEndRound,
    RoundAdvanceActionSchema
]);
export type LiveAction = Static<typeof LiveActionSchema>;
