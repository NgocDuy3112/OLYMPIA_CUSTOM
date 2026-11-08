import { KhoiDongChungAOCPlayer } from "@shared/deck/screens/KhoiDongChungAOCPlayer"
import { KhoiDongRiengAOCPlayer } from "@shared/deck/screens/KhoiDongRiengAOCPlayer"
import type { RoundModule } from "../types"

export const khoiDongAOC: RoundModule = {
    render: (ctx) =>
        ctx.stage === "phase2"
            ? <KhoiDongChungAOCPlayer ctx={ctx} />
            : <KhoiDongRiengAOCPlayer ctx={ctx} />,
}
