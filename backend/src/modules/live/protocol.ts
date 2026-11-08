import { Type, Static } from "@sinclair/typebox";
import { SubmittedAnswerValueSchema, type MatchQuestion } from "../../game/contracts/index.js";
import type { PlayerView } from "./view.js";

export const PROTOCOL_VERSION = 1;
const V = Type.Literal(PROTOCOL_VERSION);


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

export const BuzzCommand = Type.Object({
    v: V,
    type: Type.Literal("buzz"),
    requestId: Type.Optional(Type.String({ maxLength: 64 })),
    data: Type.Object({ questionId: Type.String({ minLength: 1 }) })
});

export const ClientMessageSchema = Type.Union([
    AnswerCommand, KeywordCommand, BuzzCommand
]);
export type ClientMessage = Static<typeof ClientMessageSchema>;


export interface ServerEnvelope {
    v: typeof PROTOCOL_VERSION;
    type: "view" | "console" | "ack" | "error";
    at: string;                  
    requestId?: string;
}

export interface ConsoleView {
    version: number;
    roundId: string;
    state: Record<string, unknown>;
    questions: MatchQuestion[];
    projection: Omit<PlayerView, "me">;
    roundEnded: boolean;
    connected: string[];
    console: Record<string, unknown> | null;
}

export type ServerMessage =
    | (ServerEnvelope & { type: "view"; data: { view: PlayerView } })
    | (ServerEnvelope & { type: "console"; data: { view: ConsoleView } })
    | (ServerEnvelope & { type: "ack"; data: { for: ClientMessage["type"]; result: unknown } })
    | (ServerEnvelope & { type: "error"; data: { code: string; message: string } });

const nowIso = () => new Date().toISOString();

export function viewMessage(view: PlayerView, at: string = nowIso()): ServerMessage {
    return { v: PROTOCOL_VERSION, type: "view", at, data: { view } };
}

export function consoleViewMessage(view: ConsoleView, at: string = nowIso()): ServerMessage {
    return { v: PROTOCOL_VERSION, type: "console", at, data: { view } };
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

export const CLOSE_CODES = {
    SESSION_ENDED: 4401,   // the session was revoked or the account disabled mid-connection
    NOT_SEATED: 4403       
} as const;

export function requestIdOf(raw: unknown): string | undefined {
    if (typeof raw !== "object" || raw === null) return undefined;
    const id = (raw as { requestId?: unknown }).requestId;
    return typeof id === "string" ? id : undefined;
}
