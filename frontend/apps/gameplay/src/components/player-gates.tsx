/**
 * PlayerGateScreen — the four screens a player could be stuck behind.
 *
 * Which one shows is `lib/player-gate`'s call (a tested table); this file draws it.
 * The copy is instructive on purpose: a player reading this is already stuck, so
 * every branch says what to DO — not what failed.
 *
 * The two session gates (expired 401, wrong seat 403) link to `/login` IN PLACE:
 * the message says the session is gone or the seat is not theirs, and the button
 * that fixes it is right there — the player keeps their place in the show (the
 * `?next=` carries this very page back). Those two are drawn full-height
 * (`StageShell fullHeight`) — a form, not a deck.
 *
 * The 409 wait and the loading read stay inside the 16:9 canvas: they are the
 * deck's own states and nothing has to be typed.
 */
import { Link, useLocation } from "react-router-dom"
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { Gate } from "@shared/deck/player-deck"
import { Card, CardContent } from "@shared/ui/card"
import { NOT_LIVE_HINT } from "@/lib/lobby-hint"
import { loginLink } from "@/lib/session"
import type { PlayerGate } from "@/lib/player-gate"
import type { PlayerModel } from "@/hooks/use-player-model"

/** The deck's primary action, in one place so the gates cannot drift apart. */
const actionClass = "rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground"

/** A session gate: the message, and the door that fixes it. */
function SessionGate({ title, body, next }: { title: string; body: string; next: string }) {
    return (
        <StageShell fullHeight>
            <div className="flex min-h-dvh items-center justify-center p-5">
                <Card className="w-full max-w-[30rem]">
                    <CardContent className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1 text-center">
                            <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                {title}
                            </h1>
                            <p className="font-sans text-sm text-muted-foreground">{body}</p>
                        </div>
                        <Link to={loginLink(next)} className={`${actionClass} mx-auto`}>
                            Đăng nhập
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </StageShell>
    )
}

export function PlayerGateScreen({ gate, model }: { gate: PlayerGate; model: PlayerModel }) {
    // Where to come back to after signing in: this very page (the deck route
    // carries the tournament slug), carried as ?next= on the login link.
    const here = useLocation().pathname

    if (gate === "unauthorized") {
        return (
            <SessionGate
                title="Chưa vào trận"
                body="Phiên thí sinh đã hết hạn — đăng nhập lại để vào ghế."
                next={here}
            />
        )
    }

    if (gate === "not-seated") {
        return (
            <SessionGate
                title="Không có trong trận"
                body="Ghế này không thuộc về bạn — đăng nhập bằng tài khoản của mình."
                next={here}
            />
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
