import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { GiaiMaState } from "../../game/engine/turns/giai-ma.js";

// Runtime validation for state loaded from the database. The stored JSON is untrusted:
// it may have been written by an older build. Bad state must fail loudly, never reach
// the engine.

export const GiaiMaPlayerSchema = Type.Object({
    id: Type.String(),
    hintsRevealed: Type.Integer({ minimum: 0 }),
    revealed: Type.Array(Type.String()),
    keywordLocked: Type.Boolean(),
    keywordPoints: Type.Integer(),
    eliminated: Type.Boolean()
});

export const GiaiMaStateSchema = Type.Object({
    stage: Type.Union([Type.Literal("hints"), Type.Literal("ended")]),
    players: Type.Array(GiaiMaPlayerSchema),
    hintIds: Type.Array(Type.String()),
    picked: Type.Array(Type.String()),
    openHint: Type.Union([Type.String(), Type.Null()]),
    openHintAt: Type.Union([Type.String(), Type.Null()])
});

export type GiaiMaStateJson = Static<typeof GiaiMaStateSchema>;

export class LiveStateError extends Error {
    constructor(message: string, public readonly details: string[] = []) {
        super(message);
        this.name = "LiveStateError";
    }
}

export function parseGiaiMaState(raw: unknown): GiaiMaState {
    if (!Value.Check(GiaiMaStateSchema, raw)) {
        const details = Array.from(Value.Errors(GiaiMaStateSchema, raw))
            .slice(0, 5)
            .map((e) => `${e.path || "<root>"}: ${e.message}`);
        throw new LiveStateError("stored live state failed validation", details);
    }
    return raw as GiaiMaState;
}
