import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachHeartbeat, type PingableSocket } from "../../../src/modules/live/heartbeat.js";

function fakeSocket() {
    const calls = { ping: 0, terminate: 0 };
    const listeners: Record<string, Array<() => void>> = { pong: [], close: [] };

    const socket: PingableSocket = {
        ping: () => { calls.ping += 1; },
        terminate: () => { calls.terminate += 1; },
        on: (event, listener) => {
            listeners[event].push(listener);
            return socket;
        }
    };

    return {
        socket,
        calls,
        emit: (event: "pong" | "close") => listeners[event].forEach((fn) => fn())
    };
}

describe("attachHeartbeat", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("pings on each interval", () => {
        const f = fakeSocket();
        const stop = attachHeartbeat(f.socket, 1_000);

        vi.advanceTimersByTime(1_000);
        expect(f.calls.ping).toBe(1);
        f.emit("pong");

        vi.advanceTimersByTime(1_000);
        expect(f.calls.ping).toBe(2);
        stop();
    });

    it("terminates the socket when a pong is missed", () => {
        const f = fakeSocket();
        const stop = attachHeartbeat(f.socket, 1_000);

        vi.advanceTimersByTime(1_000);   // ping, no pong
        expect(f.calls.terminate).toBe(0);

        vi.advanceTimersByTime(1_000);   // still nothing: give up
        expect(f.calls.terminate).toBe(1);
        stop();
    });

    it("keeps a socket alive as long as pongs arrive", () => {
        const f = fakeSocket();
        const stop = attachHeartbeat(f.socket, 1_000);

        for (let i = 0; i < 5; i++) {
            vi.advanceTimersByTime(1_000);
            f.emit("pong");
        }
        expect(f.calls.terminate).toBe(0);
        stop();
    });

    it("stops on close, so no further pings are sent", () => {
        const f = fakeSocket();
        attachHeartbeat(f.socket, 1_000);

        f.emit("close");
        vi.advanceTimersByTime(5_000);
        expect(f.calls.ping).toBe(0);
    });

    it("stopping twice is harmless", () => {
        const f = fakeSocket();
        const stop = attachHeartbeat(f.socket, 1_000);
        stop();
        expect(() => stop()).not.toThrow();
        vi.advanceTimersByTime(5_000);
        expect(f.calls.ping).toBe(0);
    });
});
