import { useParams } from "react-router-dom"
import { AudienceScreen } from "@/components/AudienceScreen"
import { audienceView, useAudienceLive } from "@/lib/audience"
import { useAudienceSfx } from "@/lib/sfx"


export function LivePage() {
    const { tournamentId = "", matchId = "" } = useParams()
    const live = useAudienceLive(tournamentId, matchId)
    useAudienceSfx(tournamentId, matchId)

    if (!tournamentId || !matchId) {
        return <Notice title="Thiếu đường dẫn" body="" />
    }
    if (live.isPending) return <Notice title="Đang kết nối" body="Chờ màn hình của sân khấu…" />
    if (live.isError) {
        return <Notice title="Chưa có màn hình" body="Trận chưa diễn ra, hoặc đường dẫn không còn hiệu lực." />
    }

    return <AudienceScreen view={audienceView(live.data)} />
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
