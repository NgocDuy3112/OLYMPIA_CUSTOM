import { ButPhaAOCPlayer } from "./ButPhaAOCPlayer"
import type { RoundModule } from "../types"

// Bứt phá — the AOC ruleset: four typed questions, one open at a time, each
// against its own clock.
export const butPhaAOC: RoundModule = {
    render: (ctx) => <ButPhaAOCPlayer ctx={ctx} />,
}
