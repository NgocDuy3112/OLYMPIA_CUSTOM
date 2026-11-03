import { KhoiDongChungAOCPlayer } from "@shared/deck/screens/KhoiDongChungAOCPlayer"
import { KhoiDongRiengAOCPlayer } from "@shared/deck/screens/KhoiDongRiengAOCPlayer"
import type { RoundModule } from "../types"

// Khởi động — the AOC ruleset: phase 1 projects one oral run to everybody,
// phase 2 is the shared typed batch everyone answers into.
export const khoiDongAOC: RoundModule = {
    render: (ctx) =>
        ctx.stage === "phase2"
            ? <KhoiDongChungAOCPlayer ctx={ctx} />
            : <KhoiDongRiengAOCPlayer ctx={ctx} />,
}
