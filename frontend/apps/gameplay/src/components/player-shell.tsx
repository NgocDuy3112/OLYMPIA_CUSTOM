import { useEffect, type ReactNode } from "react"
import { useSelfCam } from "@shared/lib/rtc"
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { Badges, MainCard, Rail, StageLayout } from "@shared/deck/player-deck"
import { ROUND_LABEL, pt } from "@shared/deck/geometry"
import { gateOf } from "@/lib/player-gate"
import { PlayerGateScreen } from "./player-gates"
import { usePlayerModel } from "@/hooks/use-player-model"

export function PlayerShell({ matchId }: { matchId: string }) {
    const model = usePlayerModel(matchId)

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

    if (model.screen === "lobby") {
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

