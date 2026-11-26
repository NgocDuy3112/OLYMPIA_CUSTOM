import { VeDichAOCController } from "./VeDichAOCController"
import type { VeDichChungPickCtx } from "./stage"

export type { VeDichChungPickCtx } from "./stage"

export function VeDichChungPickAOCController({ ctx }: { ctx: VeDichChungPickCtx }) {
    return <VeDichAOCController variant="chung" phase="pick" ctx={ctx} />
}
