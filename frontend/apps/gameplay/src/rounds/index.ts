import { createRoundRegistry } from "@shared/rounds/registry"
import { butPhaAOC } from "./but-pha/logic"
import { giaiMaAOC } from "./giai-ma/logic"
import { khoiDongAOC } from "./khoi-dong/logic"
import { tieBreakAOC } from "./tiebreak/logic"
import { veDichAOC } from "./ve-dich/logic"
import type { RoundModule } from "./types"


const ROUNDS = createRoundRegistry<RoundModule>({
    "khoi-dong": khoiDongAOC,
    "giai-ma": giaiMaAOC,
    "but-pha": butPhaAOC,
    "ve-dich": veDichAOC,
})

export const tieBreakModule: RoundModule = tieBreakAOC

export const roundModuleOf = ROUNDS.of
