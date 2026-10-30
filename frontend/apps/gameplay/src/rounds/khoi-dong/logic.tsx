import { KhoiDongChungOC4Player } from "./KhoiDongChungOC4Player"
import { KhoiDongRiengOC4Player } from "./KhoiDongRiengOC4Player"
import type { RoundModule } from "../types"

// Khởi động — the OC4 ruleset: phase 1 projects one oral run to everybody,
// phase 2 is the shared typed batch everyone answers into.
export const khoiDongOc4: RoundModule = {
    render: (ctx) =>
        ctx.stage === "phase2"
            ? <KhoiDongChungOC4Player ctx={ctx} />
            : <KhoiDongRiengOC4Player ctx={ctx} />,
}
