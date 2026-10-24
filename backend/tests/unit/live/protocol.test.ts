import { describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import {
    ackMessage,
    ClientMessageSchema,
    errorMessage,
    PROTOCOL_VERSION,
    requestIdOf,
    viewMessage
} from "../../../src/modules/live/protocol.js";
import type { PlayerView } from "../../../src/modules/live/view.js";

const answer = (over: Record<string, unknown> = {}) => ({
    v: 1, type: "answer", data: { questionId: "q1", value: { text: "x" } }, ...over
});

describe("client messages", () => {
    it("accepts a well-formed answer command", () => {
        expect(Value.Check(ClientMessageSchema, answer())).toBe(true);
    });

    it("accepts a command with a requestId", () => {
        expect(Value.Check(ClientMessageSchema, answer({ requestId: "abc" }))).toBe(true);
    });

    it("accepts a keyword command and a buzz command", () => {
        expect(Value.Check(ClientMessageSchema, {
            v: 1, type: "keyword", data: { questionId: "kw", value: { text: "x" } }
        })).toBe(true);
        expect(Value.Check(ClientMessageSchema, {
            v: 1, type: "buzz", data: { questionId: "q1" }
        })).toBe(true);
    });

    it("rejects a missing or wrong version", () => {
        expect(Value.Check(ClientMessageSchema, { type: "answer", data: { questionId: "q", value: { text: "x" } } })).toBe(false);
        expect(Value.Check(ClientMessageSchema, answer({ v: 2 }))).toBe(false);
    });

    it("rejects an unknown type", () => {
        expect(Value.Check(ClientMessageSchema, { v: 1, type: "wiggle", data: {} })).toBe(false);
    });

    it("rejects a command with no questionId or an empty value", () => {
        expect(Value.Check(ClientMessageSchema, { v: 1, type: "answer", data: { value: { text: "x" } } })).toBe(false);
        expect(Value.Check(ClientMessageSchema, answer({ data: { questionId: "q1", value: { text: "" } } }))).toBe(false);
    });

    it("rejects a submission that tries to use the oral marker", () => {
        expect(Value.Check(ClientMessageSchema, answer({ data: { questionId: "q1", value: { oral: true } } }))).toBe(false);
    });
});

describe("server messages", () => {
    const view: PlayerView = { matchId: "m", roundId: "giai-ma", version: 2, stage: "hints", open: [], table: [], me: {} };

    const AT = "2026-01-01T00:00:03.120Z";

    it("view messages carry the version, the server time, and the view", () => {
        expect(viewMessage(view, AT)).toEqual({
            v: PROTOCOL_VERSION, type: "view", at: AT, data: { view }
        });
    });

    it("every server message carries a server timestamp", () => {
        // Deadlines are server times, so the client needs `at` to correct its own clock.
        expect(viewMessage(view).at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(ackMessage("answer", {}).at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(errorMessage("X", "y").at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("ack messages echo the requestId when there is one", () => {
        expect(ackMessage("answer", { correct: true }, "r1", AT)).toEqual({
            v: PROTOCOL_VERSION, type: "ack", at: AT, requestId: "r1",
            data: { for: "answer", result: { correct: true } }
        });
        expect(ackMessage("answer", { correct: true })).not.toHaveProperty("requestId");
    });

    it("error messages carry a code, a message, and the requestId when known", () => {
        expect(errorMessage("NO_WINDOW", "closed", "r2", AT)).toEqual({
            v: PROTOCOL_VERSION, type: "error", at: AT, requestId: "r2",
            data: { code: "NO_WINDOW", message: "closed" }
        });
    });

    it("commands carry no authoritative time: the server stamps receipt", () => {
        // A client timestamp would be spoofable, and buzz order is server receive time.
        expect(Object.keys(answer())).not.toContain("at");
        expect(Object.keys(answer())).not.toContain("clientSentAt");
    });
});

describe("requestIdOf", () => {
    it("reads a requestId off a failing message so the error can be matched", () => {
        expect(requestIdOf({ requestId: "r9" })).toBe("r9");
    });

    it("returns undefined for anything unusable", () => {
        expect(requestIdOf(null)).toBeUndefined();
        expect(requestIdOf("nope")).toBeUndefined();
        expect(requestIdOf({ requestId: 7 })).toBeUndefined();
        expect(requestIdOf({})).toBeUndefined();
    });
});
