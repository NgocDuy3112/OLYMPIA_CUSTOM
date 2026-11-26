import { VeDichAOCPlayer, type VeDichChungPlayerCtx } from "./VeDichAOCPlayer"

export function VeDichChungAOCPlayer({ ctx }: { ctx: VeDichChungPlayerCtx }) {
    return <VeDichAOCPlayer variant="chung" phase="play" ctx={ctx} />
}
