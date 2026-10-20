import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachSessionGuard } from "../../../src/modules/live/session-guard.js";

describe("attachSessionGuard", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("leaves a valid session alone", async () => {
        const onInvalid = vi.fn();
        const stop = attachSessionGuard({ check: async () => true, onInvalid, intervalMs: 1_000 });

        await vi.advanceTimersByTimeAsync(5_000);
        expect(onInvalid).not.toHaveBeenCalled();
        stop();
    });

    it("closes once when the session stops being valid, then stops checking", async () => {
        let valid = true;
        const check = vi.fn(async () => valid);
        const onInvalid = vi.fn();
        const stop = attachSessionGuard({ check, onInvalid, intervalMs: 1_000 });

        await vi.advanceTimersByTimeAsync(1_000);
        expect(onInvalid).not.toHaveBeenCalled();

        valid = false;
        await vi.advanceTimersByTimeAsync(1_000);
        expect(onInvalid).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5_000);
        expect(onInvalid).toHaveBeenCalledTimes(1);   // no repeats, no further checks
        stop();
    });

    it("keeps the connection when the check throws (transient database error)", async () => {
        let calls = 0;
        const onInvalid = vi.fn();
        const stop = attachSessionGuard({
            check: async () => { calls += 1; throw new Error("db down"); },
            onInvalid,
            intervalMs: 1_000
        });

        await vi.advanceTimersByTimeAsync(3_000);
        expect(calls).toBe(3);
        expect(onInvalid).not.toHaveBeenCalled();
        stop();
    });

    it("does not overlap checks", async () => {
        let concurrent = 0;
        let maxConcurrent = 0;
        const stop = attachSessionGuard({
            intervalMs: 1_000,
            check: async () => {
                concurrent += 1;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await new Promise((r) => setTimeout(r, 5_000));   // slower than the interval
                concurrent -= 1;
                return true;
            },
            onInvalid: () => undefined
        });

        await vi.advanceTimersByTimeAsync(10_000);
        expect(maxConcurrent).toBe(1);
        stop();
    });

    it("stopping prevents any further checks", async () => {
        const check = vi.fn(async () => true);
        const stop = attachSessionGuard({ check, onInvalid: () => undefined, intervalMs: 1_000 });
        stop();

        await vi.advanceTimersByTimeAsync(5_000);
        expect(check).not.toHaveBeenCalled();
    });
});
