import { Type, Static } from "@sinclair/typebox";

export const Uuid = Type.String({ format: "uuid" });
export const IsoDateTime = Type.String({ format: "date-time" });

// Enum mirrors — UPPERCASE (question_kind, verdict)
export const McKind = Type.Literal("MC");
export const TextKind = Type.Literal("TEXT");
export const KeywordKind = Type.Literal("KEYWORD");
// A giai-ma hint: a typed answer question that belongs to a keyword set.
export const HintKind = Type.Literal("HINT");
export const VerdictSchema = Type.Union([Type.Literal("CORRECT"), Type.Literal("INCORRECT")]);

// JSONB vocabularies — lowercase (turn mode, seat kind)
export const OralMode = Type.Literal("oral");
export const TextMode = Type.Literal("text");
export const UserKind = Type.Literal("user");
export const TeamKind = Type.Literal("team");

export type Verdict = Static<typeof VerdictSchema>;