import type { RoundModule } from "@/rounds/types"
import { KhoiDongChungAOCPlayer } from "@shared/deck/screens/KhoiDongChungAOCPlayer"
import { KhoiDongRiengAOCPlayer } from "@shared/deck/screens/KhoiDongRiengAOCPlayer"
import { khoiDongScreenOf } from "@shared/deck/khoi-dong"

export const khoiDongAOC: RoundModule = {
    render: (ctx) => {
        if (khoiDongScreenOf(ctx.stage) === "khoi-dong-chung") return <KhoiDongChungAOCPlayer ctx={ctx} />
        return <KhoiDongRiengAOCPlayer ctx={ctx} />
    },
}
