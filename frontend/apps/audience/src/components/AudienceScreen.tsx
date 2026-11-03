import { playerScreenOf } from "@shared/deck/dispatch"
import { Gate } from "@shared/deck/primitives"
import type { PlayerView } from "@shared/deck/types"
import { audienceCtx } from "@/lib/audience"
import { ButPhaAOCPlayer } from "@shared/deck/screens/ButPhaAOCPlayer"
import { GiaiMaAOCPlayer } from "@shared/deck/screens/GiaiMaAOCPlayer"
import { KhoiDongChungAOCPlayer } from "@shared/deck/screens/KhoiDongChungAOCPlayer"
import { KhoiDongRiengAOCPlayer } from "@shared/deck/screens/KhoiDongRiengAOCPlayer"
import { VeDichChungAOCPlayer } from "@shared/deck/screens/VeDichChungAOCPlayer"
import { VeDichPickAOCPlayer } from "@shared/deck/screens/VeDichPickAOCPlayer"
import { VeDichRiengAOCPlayer } from "@shared/deck/screens/VeDichRiengAOCPlayer"

// The audience's deck: the PLAYER's screens, read-only.
//
// Not the console's pages — an audience has no ledger, no verdict controls and no
// power buttons; it watches the same round a contestant sees, plus the scoreboard
// (`table` comes in the projection). The routing rule is the kit's
// (`playerScreenOf`), so a new round appears here the day it appears on a deck.

export function AudienceScreen({ view }: { view: PlayerView }) {
    const ctx = audienceCtx(view)
    const screen = playerScreenOf(view)

    switch (screen) {
        case "lobby":
            // Between rounds the audience waits on a plain gate: the scoreboard is
            // already on screen in every round's rail, so there is nothing to add.
            return <Gate title="Chờ lên sân khấu" body="Vòng thi chưa bắt đầu — màn hình tự cập nhật." />
        case "khoi-dong-chung":
            return <KhoiDongChungAOCPlayer ctx={ctx} />
        case "khoi-dong-rieng":
            return <KhoiDongRiengAOCPlayer ctx={ctx} />
        case "giai-ma":
            return <GiaiMaAOCPlayer ctx={ctx} />
        case "but-pha":
            return <ButPhaAOCPlayer ctx={ctx} />
        case "ve-dich-pick":
            return <VeDichPickAOCPlayer ctx={ctx} />
        case "ve-dich-chung":
            return <VeDichChungAOCPlayer ctx={ctx} />
        case "ve-dich-rieng":
            return <VeDichRiengAOCPlayer ctx={ctx} />
        default:
            return <Gate title="Chưa có màn hình" body="Vòng này chưa có giao diện khán giả." />
    }
}
