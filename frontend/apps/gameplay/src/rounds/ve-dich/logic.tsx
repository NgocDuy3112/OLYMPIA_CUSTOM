import { playerScreenOf } from "@/lib/live"
import type { RoundModule } from "@/rounds/types"
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
        if (which === "ve-dich-rieng") return <VeDichRiengAOCPlayer ctx={ctx} />
        return <VeDichChungAOCPlayer ctx={ctx} />
    },
}
