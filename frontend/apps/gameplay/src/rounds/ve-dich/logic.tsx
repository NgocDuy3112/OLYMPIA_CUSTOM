import { playerScreenOf } from "@/lib/live"
import { VeDichChungAOCPlayer } from "@shared/deck/screens/VeDichChungAOCPlayer"
import { VeDichPickAOCPlayer } from "@shared/deck/screens/VeDichPickAOCPlayer"
import { VeDichRiengAOCPlayer } from "@shared/deck/screens/VeDichRiengAOCPlayer"
import type { RoundModule } from "../types"

// Về đích — the AOC ruleset: turn-based. The board draws while nothing is
// open; an open question splits by phase — typed in phase 1, oral + buzz +
// powers in phase 2 (playerScreenOf is the pure router).
export const veDichAOC: RoundModule = {
    render: (ctx) => {
        const which = playerScreenOf(ctx.v)
        if (which === "ve-dich-pick") return <VeDichPickAOCPlayer ctx={ctx} />
        if (which === "ve-dich-rieng") return <VeDichRiengAOCPlayer ctx={ctx} />
        return <VeDichChungAOCPlayer ctx={ctx} />
    },
}
