import { useParams } from "react-router-dom"
import { AudienceScreen } from "@/components/AudienceScreen"
import { audienceView, useAudienceLive } from "@/lib/audience"

/**
 * The live audience deck: `/live/:tournamentId/:matchId`.
 *
 * Rendering only — the read is public (`/spectate/*`), the observer `me` is empty
 * and every control is stripped by the `.audience` CSS layer. If the round has not
 * started (or the match is not LIVE) the API answers 404/409 and the gate says so;
 * the 2 s poll picks the round up the moment it opens.
 */
export function LivePage() {
    const { tournamentId = "", matchId = "" } = useParams()
    const live = useAudienceLive(tournamentId, matchId)

    if (!tournamentId || !matchId) {
        return <Notice title="Thiếu đường dẫn" body="Cần /live/<giải>/<trận> để xem." />
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
