import { butPhaAOC } from "./but-pha/logic"
import { giaiMaAOC } from "./giai-ma/logic"
import { khoiDongAOC } from "./khoi-dong/logic"
import { veDichAOC } from "./ve-dich/logic"
import type { RoundModule } from "./types"


const ROUNDS: Record<string, RoundModule> = {
    "khoi-dong": khoiDongAOC,
    "giai-ma": giaiMaAOC,
    "but-pha": butPhaAOC,
    "ve-dich": veDichAOC,
}

export const roundModuleOf = (roundId: string): RoundModule | null => ROUNDS[roundId] ?? null
