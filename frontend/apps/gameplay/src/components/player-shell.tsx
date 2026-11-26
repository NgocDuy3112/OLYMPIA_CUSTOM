import { useEffect, type ReactNode } from "react"
import { gateOf } from "@/lib/player-gate"
import { usePlayerModel } from "@/hooks/use-player-model"
import { useSelfCam } from "@shared/lib/rtc"
import type { StreamStatus } from "@shared/lib/ws"
import { useExitGuard } from "@shared/lib/exit-guard"
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { Gate } from "@shared/deck/primitives"
import { Badges, MainCard, Rail, StageLayout } from "@shared/deck/player-deck"
import { ROUND_LABEL, isWaitingStage, pt } from "@shared/deck/geometry"
import { PlayerGateScreen } from "./player-gates"
import { LiveHubProvider } from "./live-hub-provider"

const EXIT_WARNING = "Trận đang diễn ra — rời trang sẽ mất phần đang thi."

function LinkBanner({ status, onRetry }: { status: Extract<StreamStatus, "reconnecting" | "stopped">; onRetry: () => void }) {
    if (status === "stopped") {
        return (
            <StageShell>
                <Gate title="Phiên thi đã đóng" body="Máy chủ từ chối kết nối trận này — đăng nhập lại rồi tải lại trang.">
                    <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">
                        Tải lại
                    </button>
                </Gate>
            </StageShell>
        )
    }
    return (
        <StageShell>
            <Gate title="Đang kết nối lại" body="Mất kết nối với sân khấu — đang thử lại.">
                <button type="button" onClick={onRetry} className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">
                    Thử lại
                </button>
            </Gate>
        </StageShell>
    )
}

export function PlayerShell({ matchId }: { matchId: string }) {
    return (
        <LiveHubProvider matchId={matchId} enabled={Boolean(matchId)}>
            <PlayerShellBody matchId={matchId} />
        </LiveHubProvider>
    )
}

function PlayerShellBody({ matchId }: { matchId: string }) {
    const model = usePlayerModel(matchId)

    const roundRunning = model.v !== undefined && !isWaitingStage(model.v.stage)
    useExitGuard(roundRunning, EXIT_WARNING)

    const setSpeakGate = useSelfCam()?.setSpeakGate
    const setAudioGate = useSelfCam()?.setAudioGate
    const audioGate = model.v?.audioGate
    let speak: boolean | null = null
    if (audioGate) {
        if (model.myId) {
            speak = audioGate.allowed.includes(model.myId)
        } else {
            speak = false
        }
    }
    useEffect(() => {
        setSpeakGate?.(speak)
    }, [setSpeakGate, speak])
    useEffect(() => {
        setAudioGate?.(audioGate ?? null)
    }, [setAudioGate, audioGate])

    const gate = gateOf({ failureStatus: model.failureStatus, hasView: model.v !== undefined })
    if (gate) return <PlayerGateScreen gate={gate} model={model} />

    if (model.streamStatus === "reconnecting" || model.streamStatus === "stopped") {
        return <LinkBanner status={model.streamStatus} onRetry={model.retry} />
    }

    if (model.screen === "lobby" && !model.tiebreak) {
        if (model.lobby.data) {
            return (
                <StageShell fullHeight>
                    <Lobby
                        data={model.lobby.data}
                        meId={model.myId}
                        hint={model.lobbyHint}
                    />
                </StageShell>
            )
        }
        const v = model.v!
        return (
            <StageShell fullHeight>
                <StageLayout rail={<Rail view={v} myId={model.myId} />}>
                    <MainCard>
                        <Badges round={ROUND_LABEL[v.roundId] ?? v.roundId} />
                        <p className="font-sans leading-relaxed text-foreground" style={{ fontSize: pt(16) }}>
                            {model.lobbyHint}
                        </p>
                        <p className="font-sans text-muted-foreground" style={{ fontSize: pt(13) }}>
                            Điểm của bạn: <b className="tabular-nums text-foreground">{v.me.points ?? v.me.score ?? 0}</b>
                        </p>
                    </MainCard>
                </StageLayout>
            </StageShell>
        )
    }

    let body: ReactNode = null
    if (model.render) {
        if (model.ctx) body = model.render(model.ctx)
    }
    return <StageShell fullHeight>{body}</StageShell>
}

