import { describe, expect, it } from "vitest";
import { publish, subscribe, subscriberCount } from "../../../src/modules/live/hub.js";

describe("live hub", () => {
    it("pushes to every subscriber of a match", async () => {
        const seen: string[] = [];
        const offA = subscribe("m1", { userId: "a", push: async () => { seen.push("a"); } });
        const offB = subscribe("m1", { userId: "b", push: async () => { seen.push("b"); } });

        await publish("m1");
        expect(seen.sort()).toEqual(["a", "b"]);

        offA(); offB();
    });

    it("does not leak across matches", async () => {
        let hits = 0;
        const off = subscribe("m1", { userId: "a", push: async () => { hits += 1; } });

        await publish("m2");
        expect(hits).toBe(0);
        await publish("m1");
        expect(hits).toBe(1);

        off();
    });

    it("unsubscribing stops the pushes", async () => {
        let hits = 0;
        const off = subscribe("m1", { userId: "a", push: async () => { hits += 1; } });
        off();

        await publish("m1");
        expect(hits).toBe(0);
        expect(subscriberCount("m1")).toBe(0);
    });

    it("a failing subscriber does not stop the others", async () => {
        let ok = 0;
        const offBad = subscribe("m1", { userId: "bad", push: async () => { throw new Error("socket died"); } });
        const offGood = subscribe("m1", { userId: "good", push: async () => { ok += 1; } });

        await publish("m1");
        expect(ok).toBe(1);

        offBad(); offGood();
    });

    it("publishing to an unwatched match is a no-op", async () => {
        await expect(publish("nobody")).resolves.toBeUndefined();
    });
});
