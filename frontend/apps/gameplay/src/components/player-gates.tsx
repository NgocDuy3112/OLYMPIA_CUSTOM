/**
 * PlayerGateScreen — the four screens a player could be stuck behind.
 *
 * They are drawn INSIDE the deck's canvas (StageShell), so the furniture never
 * flickers away and the PIN card / lobby can appear in place. Which one shows is
 * `lib/player-gate`'s call (a tested table); this file only draws it.
 *
 * The copy is instructive on purpose: a player reading this is already stuck, so
 * every branch says what to DO (rejoin, tell the operator, wait) — not what
 * failed.
 */
import { Link } from "react-router-dom"
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { Gate } from "@shared/deck/player-deck"
import { NOT_LIVE_HINT } from "@/lib/lobby-hint"
import type { PlayerGate } from "@/lib/player-gate"
import type { PlayerModel } from "@/hooks/use-player-model"

/** The deck's primary action, in one place so the gates cannot drift apart. */
const actionClass = "rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground"

export function PlayerGateScreen({ gate, model }: { gate: PlayerGate; model: PlayerModel }) {
    if (gate === "unauthorized") {
        return (
            <StageShell>
                <Gate title="Chưa vào trận" body="Phiên thí sinh đã hết hạn — nhập lại mã PIN để vào ghế.">
                    <Link to="/join" className={actionClass}>Nhập lại mã PIN</Link>
                </Gate>
            </StageShell>
        )
    }

    if (gate === "not-seated") {
        return (
            <StageShell>
                <Gate title="Không có trong trận" body="Ghế này không thuộc về bạn — báo lại với ban điều hành.">
                    <Link to="/join" className={actionClass}>Nhập mã khác</Link>
                </Gate>
            </StageShell>
        )
    }

    if (gate === "not-live") {
        // Not LIVE yet — the lobby IS the waiting screen (the hook keeps polling).
        return (
            <StageShell>
                {model.lobby.data ? (
                    <Lobby data={model.lobby.data} meId={model.myId} hint={NOT_LIVE_HINT} />
                ) : (
                    <Gate title="Trận chưa bắt đầu" body="Điều hành chưa mở trận — trang tự cập nhật khi trận sang LIVE.">
                        <button onClick={model.retry} className={actionClass}>Thử lại</button>
                    </Gate>
                )}
            </StageShell>
        )
    }

    return (
        <StageShell>
            <Gate title="Đang tải…" body={model.failureMessage ?? "Đọc trạng thái vòng thi"}>
                {model.failureMessage ? (
                    <button onClick={model.retry} className={actionClass}>Thử lại</button>
                ) : null}
            </Gate>
        </StageShell>
    )
}
