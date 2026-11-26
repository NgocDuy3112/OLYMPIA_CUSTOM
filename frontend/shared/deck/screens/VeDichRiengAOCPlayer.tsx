import { VeDichAOCPlayer, type VeDichRiengPlayerCtx } from "./VeDichAOCPlayer"

export type { VeDichRiengPlayerCtx } from "./VeDichAOCPlayer"

export function VeDichRiengAOCPlayer({ ctx }: { ctx: VeDichRiengPlayerCtx }) {
    return <VeDichAOCPlayer variant="rieng" phase="play" ctx={ctx} />
}
