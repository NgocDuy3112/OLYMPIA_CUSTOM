import type { RoundModule } from "@/rounds/types"
import { GiaiMaAOCPlayer } from "@shared/deck/screens/GiaiMaAOCPlayer"

export const giaiMaAOC: RoundModule = {
    render: (ctx) => <GiaiMaAOCPlayer ctx={ctx} />,
}
