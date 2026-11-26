import { VeDichAOCController } from "./VeDichAOCController"
import type { VeDichRiengPickCtx } from "./stage"

export type { VeDichRiengPickCtx } from "./stage"

export function VeDichRiengPickAOCController({ ctx }: { ctx: VeDichRiengPickCtx }) {
    return <VeDichAOCController variant="rieng" phase="pick" ctx={ctx} />
}
