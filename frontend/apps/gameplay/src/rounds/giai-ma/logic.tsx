import { GiaiMaAOCPlayer } from "@shared/deck/screens/GiaiMaAOCPlayer"
import type { RoundModule } from "../types"

export const giaiMaAOC: RoundModule = {
    render: (ctx) => <GiaiMaAOCPlayer ctx={ctx} />,
}
