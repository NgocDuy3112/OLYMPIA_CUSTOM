import { playerScreenOf } from "@/lib/live"
import { VeDichChungAOCPlayer } from "@shared/deck/screens/VeDichChungAOCPlayer"
import { VeDichPickAOCPlayer } from "@shared/deck/screens/VeDichPickAOCPlayer"
import { VeDichRiengAOCPlayer } from "@shared/deck/screens/VeDichRiengAOCPlayer"
import type { RoundModule } from "../types"

export const veDichAOC: RoundModule = {
    render: (ctx) => {
        const which = playerScreenOf(ctx.v)
        if (which === "ve-dich-pick") return <VeDichPickAOCPlayer ctx={ctx} />
        if (which === "ve-dich-rieng") return <VeDichRiengAOCPlayer ctx={ctx} />
        return <VeDichChungAOCPlayer ctx={ctx} />
    },
}
