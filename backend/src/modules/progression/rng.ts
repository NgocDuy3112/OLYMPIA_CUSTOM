import { randomBytes } from "node:crypto";
import type { Rng } from "./plan.js";

export const RNG_ALGORITHM = "mulberry32";

export function newDrawSeed(bytes = 16): string {
    return randomBytes(bytes).toString("hex");
}

export function rngFromSeed(seed: string): Rng {
    const parsed = Number.parseInt(seed.slice(0, 8), 16);
    if (!Number.isFinite(parsed)) {
        throw new Error(`rngFromSeed: seed must begin with 8 hex characters, got "${seed}"`);
    }

    let state = parsed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}