import type { VeDichChungCtx, VeDichPickCtx, VeDichRiengCtx } from "./stage"
import { VeDichPickStage } from "./VeDichPickStage"
import { VeDichPlayChung } from "./VeDichPlayChung"
import { VeDichPlayRieng } from "./VeDichPlayRieng"

type VeDichVariant = "rieng" | "chung"

export type VeDichProps =
    | { variant: VeDichVariant; phase: "pick"; ctx: VeDichPickCtx }
    | { variant: "rieng"; phase: "play"; ctx: VeDichRiengCtx }
    | { variant: "chung"; phase: "play"; ctx: VeDichChungCtx }

export function VeDichAOCController(props: VeDichProps) {
    if (props.phase === "pick") {
        return <VeDichPickStage variant={props.variant} ctx={props.ctx} />
    }
    if (props.variant === "rieng") return <VeDichPlayRieng ctx={props.ctx} />
    return <VeDichPlayChung ctx={props.ctx} />
}
