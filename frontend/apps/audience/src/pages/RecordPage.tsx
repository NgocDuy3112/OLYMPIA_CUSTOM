import { useEffect, useRef } from "react"
import { useParams } from "react-router-dom"
import type { RemoteVideoTrack } from "livekit-client"
import { AudienceScreen } from "@/components/AudienceScreen"
import { audienceView, useAudienceLive } from "@/lib/audience"
import { api } from "@shared/lib/api"
import { useRtcPeerTracks, useRtcRoom } from "@shared/lib/rtc"


interface ViewerRtcToken {
    url: string
    token: string
    identity: string
    room: string
    expiresIn: number
}

// The egress worker renders this page headless — this IS the composite the
// show records: the deck on the left, every published camera on the right,
// and the room's mixed audio (players + host, gated by the console) playing
// for the page to capture. Reusing AudienceScreen keeps the recording in
// lockstep with what the venue screen shows.
function fetchViewerRtcToken(matchId: string): Promise<ViewerRtcToken> {
    return api<ViewerRtcToken>(`/gameplay/matches/${matchId}/rtc/viewer-token`, {
        method: "POST",
    })
}


function CameraTile({ track }: { track: RemoteVideoTrack }) {
    const holder = useRef<HTMLSpanElement>(null)
    useEffect(() => {
        const box = holder.current
        if (!box) return
        const video = track.attach()
        video.className = "h-full w-full object-cover"
        box.append(video)
        return () => {
            track.detach(video)
            video.remove()
        }
    }, [track])
    return (
        <span
            ref={holder}
            className="relative block aspect-video overflow-hidden rounded-lg bg-muted"
            aria-hidden
        />
    )
}


export function RecordPage() {
    const { tournamentId = "", matchId = "" } = useParams()
    const live = useAudienceLive(tournamentId, matchId)

    // Join as a plain viewer: audio arrives through the SDK's own playback
    // (the same path useAudioGate volumes on the player deck), so this page
    // must NOT attach audio tracks itself — that would double the sound.
    const rtc = useRtcRoom({
        enabled: Boolean(matchId),
        autoSubscribe: true,
        getToken: () => fetchViewerRtcToken(matchId),
        resetKey: matchId,
    })
    const peers = useRtcPeerTracks(rtc.room)

    if (!tournamentId || !matchId) {
        return <Notice title="Thiếu đường dẫn" body="" />
    }
    if (live.isPending) {
        return <Notice title="Đang kết nối" body="Chờ màn hình của sân khấu…" />
    }
    if (live.isError) {
        return (
            <Notice
                title="Chưa có màn hình"
                body="Trận chưa diễn ra, hoặc đường dẫn không còn hiệu lực."
            />
        )
    }

    const cameras = [...peers.entries()].flatMap(([identity, peer]) =>
        peer.video ? [{ identity, video: peer.video }] : []
    )

    return (
        <div className="flex min-h-dvh gap-3 p-3">
            <main className="min-w-0 flex-1">
                <AudienceScreen view={audienceView(live.data)} />
            </main>
            <aside className="flex w-56 shrink-0 flex-col gap-3">
                <h2 className="font-display text-sm font-bold uppercase text-muted-foreground">
                    Máy quay
                </h2>
                {cameras.length === 0 && (
                    <p className="text-xs text-muted-foreground">Chưa có máy quay nào bật.</p>
                )}
                {cameras.map(({ identity, video }) => (
                    <CameraTile key={identity} track={video} />
                ))}
            </aside>
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
