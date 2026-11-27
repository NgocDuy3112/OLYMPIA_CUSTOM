import { useParams, useSearchParams } from "react-router-dom"
import { AudienceScreen } from "@/components/AudienceScreen"
import { audienceView, useAudienceLive } from "@/lib/audience"


export function LivePage() {
    const { tournamentId = "", matchId = "" } = useParams()
    const [search] = useSearchParams()
    const live = useAudienceLive(tournamentId, matchId)
    const led = search.get("mode") === "led"

    if (!tournamentId || !matchId) {
        return <Notice role="alert" title="Thiếu đường dẫn" body="" />
    }
    if (live.isPending) return <Notice role="status" title="Đang kết nối" body="Chờ màn hình của sân khấu…" />
    if (live.isError) {
        return <Notice role="alert" title="Chưa có màn hình" body="Trận chưa diễn ra, hoặc đường dẫn không còn hiệu lực." />
    }

    let shellCls = "min-h-dvh"
    if (led) shellCls = "audience min-h-dvh led-mode"
    return (
        <div className={shellCls}>
            <AudienceScreen view={audienceView(live.data)} />
        </div>
    )
}

function Notice({ title, body, role }: { title: string; body: string; role: "status" | "alert" }) {
    return (
        <div role={role} className="flex min-h-dvh items-center justify-center px-5 py-10 text-center sm:px-6">
            <div className="flex max-w-md flex-col gap-3">
                <h1 className="font-display text-2xl font-bold uppercase leading-tight sm:text-3xl">{title}</h1>
                <p className="font-sans text-sm leading-relaxed text-muted-foreground sm:text-base">{body}</p>
            </div>
        </div>
    )
}
