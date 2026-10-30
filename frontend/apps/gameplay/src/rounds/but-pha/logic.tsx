import { ButPhaOC4Player } from "./ButPhaOC4Player"
import type { RoundModule } from "../types"

// Bứt phá — the OC4 ruleset: four typed questions, one open at a time, each
// against its own clock.
export const butPhaOc4: RoundModule = {
    render: (ctx) => <ButPhaOC4Player ctx={ctx} />,
}
