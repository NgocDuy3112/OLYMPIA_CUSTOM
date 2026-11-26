import type { RoundModule } from "@/rounds/types"
import { playerScreenOf } from "@shared/deck/dispatch"
import type { VeDichRiengPlayerCtx } from "@shared/deck/screens/VeDichRiengAOCPlayer"
import { VeDichChungAOCPlayer } from "@shared/deck/screens/VeDichChungAOCPlayer"
import { VeDichChungPickAOCPlayer } from "@shared/deck/screens/VeDichChungPickAOCPlayer"
import { VeDichRiengPickAOCPlayer } from "@shared/deck/screens/VeDichRiengPickAOCPlayer"
import { VeDichRiengAOCPlayer } from "@shared/deck/screens/VeDichRiengAOCPlayer"

export const veDichAOC: RoundModule = {
    render: (ctx) => {
        const which = playerScreenOf(ctx.v)
        if (which === "ve-dich-pick") {
            if (ctx.stage === "phase2") return <VeDichRiengPickAOCPlayer ctx={ctx} />
            return <VeDichChungPickAOCPlayer ctx={ctx} />
        }
        // Both answer screens tolerate an open question vanishing between frames
        // (resolve / switch) — they read `open[0] ?? null`.
        if (which === "ve-dich-rieng") {
            return <VeDichRiengAOCPlayer ctx={ctx as VeDichRiengPlayerCtx} />
        }
        return <VeDichChungAOCPlayer ctx={ctx} />
    },
}
