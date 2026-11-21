import type { RoundModule } from "@/rounds/types"
import { playerScreenOf } from "@shared/deck/dispatch"
import type { VeDichRiengPlayerCtx } from "@shared/deck/screens/VeDichRiengAOCPlayer"
import { VeDichChungAOCPlayer } from "@shared/deck/screens/VeDichChungAOCPlayer"
import { VeDichChungPickPlayer } from "@shared/deck/screens/VeDichChungPickPlayer"
import { VeDichRiengPickPlayer } from "@shared/deck/screens/VeDichRiengPickPlayer"
import { VeDichRiengAOCPlayer } from "@shared/deck/screens/VeDichRiengAOCPlayer"

export const veDichAOC: RoundModule = {
    render: (ctx) => {
        const which = playerScreenOf(ctx.v)
        if (which === "ve-dich-pick") {
            if (ctx.stage === "phase2") return <VeDichRiengPickPlayer ctx={ctx} />
            return <VeDichChungPickPlayer ctx={ctx} />
        }
        // An open question can vanish between frames (resolve / switch). Both
        // answer screens tolerate that, the buzz screen does not — fall back to
        // the chung screen instead of dereferencing open[0].
        if (which === "ve-dich-rieng" && ctx.open.length > 0) {
            return <VeDichRiengAOCPlayer ctx={ctx as VeDichRiengPlayerCtx} />
        }
        return <VeDichChungAOCPlayer ctx={ctx} />
    },
}
