import { playerScreenOf } from "@/lib/live"
import { VeDichChungOC4Player } from "./VeDichChungOC4Player"
import { VeDichPickOC4Player } from "./VeDichPickOC4Player"
import { VeDichRiengOC4Player } from "./VeDichRiengOC4Player"
import type { RoundModule } from "../types"

// Về đích — the OC4 ruleset: turn-based. The board draws while nothing is
// open; an open question splits by phase — typed in phase 1, oral + buzz +
// powers in phase 2 (playerScreenOf is the pure router).
export const veDichOc4: RoundModule = {
    render: (ctx) => {
        const which = playerScreenOf(ctx.v)
        if (which === "ve-dich-pick") return <VeDichPickOC4Player ctx={ctx} />
        if (which === "ve-dich-rieng") return <VeDichRiengOC4Player ctx={ctx} />
        return <VeDichChungOC4Player ctx={ctx} />
    },
}
