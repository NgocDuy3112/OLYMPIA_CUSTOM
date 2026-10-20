// The live socket protocol. One envelope in both directions, one version field, and a
// schema per client command. Every server message carries `v` and `type`; replies carry
// the requestId they answer, so a result can be matched even though view pushes interleave.
import { Type, Static } from "@sinclair/typebox";
import { SubmittedAnswerValueSchema } from "../../game/contracts/index.js";
import type { PlayerView } from "./view.js";

export const PROTOCOL_VERSION = 1;
const V = Type.Literal(PROTOCOL_VERSION);

// ── Client → server ───────────────────────────────────────────────────────────

export const AnswerCommand = Type.Object({
    v: V,
    type: Type.Literal("answer"),
    requestId: Type.Optional(Type.String({ maxLength: 64 })),
    data: Type.Object({
        questionId: Type.String({ minLength: 1 }),
        value: SubmittedAnswerValueSchema
    })
});

export const KeywordCommand = Type.Object({
    v: V,
    type: Type.Literal("keyword"),
    requestId: Type.Optional(Type.String({ maxLength: 64 })),
    data: Type.Object({
        questionId: Type.String({ minLength: 1 }),
        value: SubmittedAnswerValueSchema
    })
});

// ve-dich commands. The player is always taken from the session, never from the message.
export const PickCommand = Type.Object({
    v: V,
    type: Type.Literal("pick"),
    requestId: Type.Optional(Type.String({ maxLength: 64 })),
    data: Type.Object({ questionId: Type.String({ minLength: 1 }) })
});

export const PickBatchCommand = Type.Object({
    v: V,
    type: Type.Literal("pickBatch"),
    requestId: Type.Optional(Type.String({ maxLength: 64 })),
    data: Type.Object({
        questionIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 3, maxItems: 3 })
    })
});

export const PowerCommand = Type.Object({
    v: V,
    type: Type.Literal("power"),
    requestId: Type.Optional(Type.String({ maxLength: 64 })),
    data: Type.Object({ power: Type.Union([Type.Literal("HOPE"), Type.Literal("SHIELD")]) })
});

export const BuzzCommand = Type.Object({
    v: V,
    type: Type.Literal("buzz"),
    requestId: Type.Optional(Type.String({ maxLength: 64 })),
    data: Type.Object({ questionId: Type.String({ minLength: 1 }) })
});

export const ClientMessageSchema = Type.Union([
    AnswerCommand, KeywordCommand, PickCommand, PickBatchCommand, PowerCommand, BuzzCommand
]);
export type ClientMessage = Static<typeof ClientMessageSchema>;

// ── Server → client ───────────────────────────────────────────────────────────

// `at` is the server's clock at send time. Round deadlines are absolute SERVER times, so
// a client whose own clock is off would render a wrong countdown; it uses `at` to work out
// the offset once and correct every deadline. It is display only — never authority.
export interface ServerEnvelope {
    v: typeof PROTOCOL_VERSION;
    type: "view" | "ack" | "error";
    at: string;                  // ISO, server time
    requestId?: string;
}

export type ServerMessage =
    | (ServerEnvelope & { type: "view"; data: { view: PlayerView } })
    | (ServerEnvelope & { type: "ack"; data: { for: ClientMessage["type"]; result: unknown } })
    | (ServerEnvelope & { type: "error"; data: { code: string; message: string } });

const nowIso = () => new Date().toISOString();

export function viewMessage(view: PlayerView, at: string = nowIso()): ServerMessage {
    return { v: PROTOCOL_VERSION, type: "view", at, data: { view } };
}

export function ackMessage(
    forType: ClientMessage["type"],
    result: unknown,
    requestId?: string,
    at: string = nowIso()
): ServerMessage {
    return {
        v: PROTOCOL_VERSION, type: "ack", at,
        ...(requestId ? { requestId } : {}),
        data: { for: forType, result }
    };
}

export function errorMessage(
    code: string,
    message: string,
    requestId?: string,
    at: string = nowIso()
): ServerMessage {
    return {
        v: PROTOCOL_VERSION, type: "error", at,
        ...(requestId ? { requestId } : {}),
        data: { code, message }
    };
}

// Codes a client may see, so the frontend can switch on them without guessing.
export const PROTOCOL_ERROR_CODES = [
    "BAD_MESSAGE",     // not JSON, wrong version, or an unknown/malformed command
    "UNKNOWN_MESSAGE", // a valid command the server does not act on (reserved; none today)
    "UNAVAILABLE",     // the match is not live, or there is no round
    "NOT_SEATED", "NOT_LIVE", "NOT_STARTED", "NO_ROUND", "BAD_VALUE",
    "NO_WINDOW", "WINDOW_CLOSED", "LOCKED", "NOT_IN_MATCH", "NOT_OPEN",
    "NO_QUESTION", "NO_CLOCK", "ENDED", "PHASE_CLOSED", "NOT_IN_PHASE",
    "NO_KEYWORD", "NOT_KEYWORD", "ALREADY_SUBMITTED", "INTERNAL"
] as const;

// WebSocket close codes a client must handle. 4xxx is the application range; 1000/1006
// are the browser's own normal/unclean codes.
export const CLOSE_CODES = {
    SESSION_ENDED: 4401,   // the session was revoked or the account disabled mid-connection
    NOT_SEATED: 4403       // the caller is not a player in this match
} as const;

export type ServerCloseCode = (typeof CLOSE_CODES)[keyof typeof CLOSE_CODES];

// Read a requestId off a message that failed validation, so the error can still be matched.
export function requestIdOf(raw: unknown): string | undefined {
    if (typeof raw !== "object" || raw === null) return undefined;
    const id = (raw as { requestId?: unknown }).requestId;
    return typeof id === "string" ? id : undefined;
}
