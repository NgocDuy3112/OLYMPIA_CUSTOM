import type { ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { Button, buttonVariants } from "@shared/ui/button"
import { Badge } from "@shared/ui/badge"
import { cn } from "cn"
import { isUnauthorized, loginLink, useMe } from "@/lib/session"
import { roundNameOf } from "@/lib/adapters"
import type { TournamentRound } from "@/lib/api"
import type { Match } from "@/lib/types"
import { screenFor, useLiveMatch, type LiveScreen } from "@/lib/live"
import { Scoreboard, type ScreenProps } from "./parts"
import { LobbyScreen } from "./LobbyScreen"
import { KhoiDongBatchScreen, KhoiDongOralScreen } from "./KhoiDongScreens"
import { GiaiMaScreen } from "./GiaiMaScreen"
import { ButPhaScreen } from "./ButPhaScreen"
import { VeDichScreen } from "./VeDichScreen"

// The player's live match surface (L3). One container decides WHICH screen
// (pure screenFor), then renders it beside the scoreboard that never leaves the
// page. Data is push-first: GET /live paints, the stream replaces it, commands
// refetch — no polling anywhere, all countdowns on the shared clock.

interface LiveMatchViewProps {
    match: Match
    rounds: TournamentRound[]
    onBack: () => void
}

// The chip under the round's name — what this screen IS right now.
function stageLabel(screen: LiveScreen, stage: string): string {
    switch (screen) {
        case "lobby": return "Chờ MC"
        case "khoi-dong-oral": return "Phần 1 · Trả lời miệng"
        case "khoi-dong-batch": return "Phần 2 · 60 giây cả lượt"
        case "giai-ma-window": return "Gợi ý mở · 15 giây"
        case "giai-ma-idle": return "Nộp từ khóa"
        case "but-pha": return "30 giây mỗi câu"
        case "ve-dich": return stage === "phase1" ? "Phần 1 · Chọn câu" : "Phần 2 · Bấm chuông"
        default: return "Vòng chưa hỗ trợ"
    }
}

export function LiveMatchView({ match, rounds, onBack }: LiveMatchViewProps) {
    const location = useLocation()
    const me = useMe()

    const signedOut = isUnauthorized(me.error) || me.data === null
    const sessionPending = me.isPending
    const mayFetch = !sessionPending && !signedOut

    const { view, failure, clock, refetch } = useLiveMatch(match.id, mayFetch)

    const shell = (children: ReactNode) => (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">{children}</div>
    )

    // Checking the session, or the first fetch — a skeleton, never a wrong screen.
    if (sessionPending || (!view && !failure)) {
        return shell(<div role="status" aria-label="Đang tải" className="h-72 animate-pulse rounded-xl bg-muted" />)
    }

    if (signedOut || failure?.status === 401) {
        return shell(
            <GateCard title="Xem trận trực tiếp">
                <p className="text-sm text-muted-foreground">
                    Đăng nhập để chơi — bạn cần ngồi vào ghế của trận này.
                </p>
                <a
                    href={loginLink(location.pathname)}
                    className={cn(buttonVariants({ size: "lg" }), "mt-2 self-start")}
                >
                    Đăng nhập với Google
                </a>
            </GateCard>
        )
    }

    if (failure?.status === 403 || failure?.code === "NOT_SEATED") {
        return shell(
            <GateCard title="Không có mặt trong trận này">
                <p className="text-sm text-muted-foreground">
                    Bạn không nằm trong danh sách thí sinh của trận này. Liên hệ ban tổ
                    chức nếu nghĩ đây là sai sót.
                </p>
            </GateCard>
        )
    }

    // 409: the match is not LIVE (yet, or any more) — the view cannot exist.
    if (failure?.status === 409) {
        return shell(
            <GateCard title="Trận chưa diễn ra">
                <p className="text-sm text-muted-foreground">
                    Trận này chưa bắt đầu hoặc đã kết thúc. Trở lại lịch thi đấu để xem
                    các trận khác.
                </p>
                <Button variant="outline" className="mt-2 self-start" onClick={onBack}>
                    ◀ Lịch thi đấu
                </Button>
            </GateCard>
        )
    }

    if (failure || !view) {
        return shell(
            <GateCard title="Không tải được trận đấu">
                <p role="alert" className="text-sm text-destructive">
                    {failure?.message ?? "Kết nối tới máy chủ thất bại."}
                </p>
                <Button className="mt-2 self-start" variant="outline" onClick={refetch}>
                    Thử lại
                </Button>
            </GateCard>
        )
    }

    // ── the screen ───────────────────────────────────────────────────────────
    const screen = screenFor(view)
    const props: ScreenProps = { matchId: match.id, view, clock, meId: me.data?.id }

    const body = (() => {
        switch (screen) {
            case "lobby": return <LobbyScreen {...props} />
            case "khoi-dong-oral": return <KhoiDongOralScreen {...props} />
            case "khoi-dong-batch": return <KhoiDongBatchScreen {...props} />
            case "giai-ma-window":
            case "giai-ma-idle": return <GiaiMaScreen {...props} />
            case "but-pha": return <ButPhaScreen {...props} />
            case "ve-dich": return <VeDichScreen {...props} />
            default:
                return (
                    <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                        Trình duyệt chưa nhận ra vòng này — hỏi trực tiếp MC.
                    </div>
                )
        }
    })()

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:py-8">
            <header className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                    <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
                        ◀ Lịch thi đấu
                    </Button>
                    <span className="text-sm text-muted-foreground">{match.round}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="font-heading text-2xl font-semibold">
                        {roundNameOf(rounds, view.roundId)}
                    </h1>
                    <Badge variant="outline">{stageLabel(screen, view.stage)}</Badge>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
                        <span className="size-2 animate-pulse rounded-full bg-red-600" aria-hidden />
                        TRỰC TIẾP
                    </span>
                </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="flex min-w-0 flex-col gap-5">{body}</div>
                <aside className="flex flex-col gap-4">
                    <Scoreboard
                        table={view.table}
                        meId={me.data?.id}
                        footer="Điểm cộng dồn từ các câu đã chấm trong trận."
                    />
                </aside>
            </div>
        </div>
    )
}

function GateCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="flex flex-col rounded-xl border bg-card p-6">
            <h1 className="font-heading text-2xl font-semibold">{title}</h1>
            <div className="mt-3 flex flex-col gap-2">{children}</div>
        </div>
    )
}
