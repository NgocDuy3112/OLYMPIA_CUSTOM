import { butPhaAOC } from "./but-pha/logic"
import { giaiMaAOC } from "./giai-ma/logic"
import { khoiDongAOC } from "./khoi-dong/logic"
import { veDichAOC } from "./ve-dich/logic"
import type { RoundModule } from "./types"

// ── the player surface's round registry ─────────────────────────────────────
// One entry per RULESET (see types.ts): the live view's roundId picks the
// module, the module owns the player screens. A custom tournament registers
// its own round here — mix AOC rounds with future variants freely.
//
// playerScreenOf (lib/live) still decides LOBBY vs screen; this registry
// draws the screen itself. The future OBS overlay reuses both.

export const ROUNDS: Record<string, RoundModule> = {
    "khoi-dong": khoiDongAOC,
    "giai-ma": giaiMaAOC,
    "but-pha": butPhaAOC,
    "ve-dich": veDichAOC,
}

/** The round's module — null only for a round the lobby already owns. */
export const roundModuleOf = (roundId: string): RoundModule | null => ROUNDS[roundId] ?? null
