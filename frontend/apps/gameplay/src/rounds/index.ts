import { butPhaOc4 } from "./but-pha/logic"
import { giaiMaOc4 } from "./giai-ma/logic"
import { khoiDongOc4 } from "./khoi-dong/logic"
import { veDichOc4 } from "./ve-dich/logic"
import type { RoundModule } from "./types"

// ── the player surface's round registry ─────────────────────────────────────
// One entry per RULESET (see types.ts): the live view's roundId picks the
// module, the module owns the player screens. A custom tournament registers
// its own round here — mix OC4 rounds with future variants freely.
//
// playerScreenOf (lib/live) still decides LOBBY vs screen; this registry
// draws the screen itself. The future OBS overlay reuses both.

export const ROUNDS: Record<string, RoundModule> = {
    "khoi-dong": khoiDongOc4,
    "giai-ma": giaiMaOc4,
    "but-pha": butPhaOc4,
    "ve-dich": veDichOc4,
}

/** The round's module — null only for a round the lobby already owns. */
export const roundModuleOf = (roundId: string): RoundModule | null => ROUNDS[roundId] ?? null
