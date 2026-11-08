import { Type, Static } from "@sinclair/typebox";

export const Uuid = Type.String({ format: "uuid" });
export const IsoDateTime = Type.String({ format: "date-time" });

export const ChoiceKind = Type.Literal("CHOICE");
export const TextKind = Type.Literal("TEXT");
export const KeywordKind = Type.Literal("KEYWORD");
export const HintKind = Type.Literal("HINT");
export const VerdictSchema = Type.Union([Type.Literal("CORRECT"), Type.Literal("INCORRECT")]);

export const OralMode = Type.Literal("oral");
export const TextMode = Type.Literal("text");
export const UserKind = Type.Literal("user");

