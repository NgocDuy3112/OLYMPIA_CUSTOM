import type { RoundModule } from "@/rounds/types"
import { ButPhaAOCPlayer } from "@shared/deck/screens/ButPhaAOCPlayer"

export const butPhaAOC: RoundModule = {
    render: (ctx) => <ButPhaAOCPlayer ctx={ctx} />,
}
