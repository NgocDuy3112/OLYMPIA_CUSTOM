import { KhoiDongChungAOCPlayer } from "@shared/deck/screens/KhoiDongChungAOCPlayer"
import { KhoiDongRiengAOCPlayer } from "@shared/deck/screens/KhoiDongRiengAOCPlayer"
import type { RoundModule } from "../types"

export const khoiDongAOC: RoundModule = {
    render: (ctx) => {
        if (ctx.stage === "phase2") return <KhoiDongChungAOCPlayer ctx={ctx} />
        return <KhoiDongRiengAOCPlayer ctx={ctx} />
    },
}
