import type { PlayerCore } from "../player-deck"
import { VeDichAOCPlayer } from "./VeDichAOCPlayer"

export function VeDichChungPickAOCPlayer({ ctx }: { ctx: PlayerCore }) {
    return <VeDichAOCPlayer variant="chung" phase="pick" ctx={ctx} />
}
