import { Hourglass } from "lucide-react"

// The waiting screen: the round exists but the MC has not started it — or a
// round just ended and the MC has not advanced yet. The scoreboard in the
// sidebar keeps moving; this card only says "the next move is the MC's".
export function LobbyScreen() {
    return (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
            <Hourglass className="size-8 text-muted-foreground" aria-hidden />
            <h2 className="font-heading text-2xl font-semibold">Chờ MC</h2>
            <p className="max-w-md text-sm text-muted-foreground">
                MC đang chuẩn bị. Trang tự cập nhật — không cần tải lại.
            </p>
            <p className="flex items-center gap-2 text-sm">
                <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
                Trực tiếp
            </p>
        </div>
    )
}
