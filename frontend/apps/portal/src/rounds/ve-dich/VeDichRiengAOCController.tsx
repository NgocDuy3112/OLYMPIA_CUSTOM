import { VeDichAOCController } from "./VeDichAOCController"
import type { VeDichRiengCtx } from "./stage"

export type { VeDichRiengCtx } from "./stage"

export function VeDichRiengAOCController({ ctx }: { ctx: VeDichRiengCtx }) {
    return <VeDichAOCController variant="rieng" phase="play" ctx={ctx} />
}
