import { VeDichAOCController } from "./VeDichAOCController"
import type { VeDichChungCtx } from "./stage"

export type { VeDichChungCtx } from "./stage"

export function VeDichChungAOCController({ ctx }: { ctx: VeDichChungCtx }) {
    return <VeDichAOCController variant="chung" phase="play" ctx={ctx} />
}
