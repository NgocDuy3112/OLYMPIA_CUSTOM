import { useParams, useSearchParams } from "react-router-dom"
import { AudienceScreen } from "@/components/AudienceScreen"
import { audienceView, useAudienceLive } from "@/lib/audience"


export function LivePage() {
    const { tournamentId = "", matchId = "" } = useParams()
    const [search] = useSearchParams()
    const live = useAudienceLive(tournamentId, matchId)
    const led = search.get("mode") === "led"

    if (!tournamentId || !matchId) {
        return <Notice title="Thiếu đường dẫn" body="" />
    }
    if (live.isPending) return <Notice title="Đang kết nối" body="Chờ màn hình của sân khấu…" />
    if (live.isError) {
        return <Notice title="Chưa có màn hình" body="Trận chưa diễn ra, hoặc đường dẫn không còn hiệu lực." />
    }

    let shellCls = "min-h-dvh"
    if (led) shellCls = "audience min-h-dvh led-mode"
    return (
        <div className={shellCls}>
            <AudienceScreen view={audienceView(live.data)} />
        </div>
    )
}

function Notice({ title, body }: { title: string; body: string }) {
    return (
        <div className="flex min-h-dvh items-center justify-center px-6 text-center">
            <div className="flex max-w-md flex-col gap-2">
                <h1 className="font-display text-2xl font-bold uppercase">{title}</h1>
                <p className="font-sans text-sm text-muted-foreground">{body}</p>
            </div>
        </div>
    )
}
