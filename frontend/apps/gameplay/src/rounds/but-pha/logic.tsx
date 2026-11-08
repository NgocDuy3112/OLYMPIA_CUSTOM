import { ButPhaAOCPlayer } from "@shared/deck/screens/ButPhaAOCPlayer"
import type { RoundModule } from "../types"

export const butPhaAOC: RoundModule = {
    render: (ctx) => <ButPhaAOCPlayer ctx={ctx} />,
}
