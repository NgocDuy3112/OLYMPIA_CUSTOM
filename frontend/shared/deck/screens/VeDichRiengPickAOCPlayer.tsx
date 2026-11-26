import type { PlayerCore } from "../player-deck"
import { VeDichAOCPlayer } from "./VeDichAOCPlayer"

export function VeDichRiengPickAOCPlayer({ ctx }: { ctx: PlayerCore }) {
    return <VeDichAOCPlayer variant="rieng" phase="pick" ctx={ctx} />
}
