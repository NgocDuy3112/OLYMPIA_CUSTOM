import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { Badges, StageLayout } from "@/components/stage/deck"
import { ROUND_LABEL, pt } from "@shared/deck/geometry"
import { AdjustScoreDialog } from "./AdjustScoreDialog"
import { ConsoleHostContext, ConsoleToolbar } from "./ConsoleToolbar"
import { useConsoleModel } from "./use-console-model"


export function Controller({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
    const model = useConsoleModel(tournamentId, matchId)

    if (model.phase === "loading") {
        return (
            <StageShell>
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Đang tải vòng thi…</div>
            </StageShell>
        )
    }

    if (model.phase === "error") {
        return (
            <StageShell>
                <div role="alert" className="flex h-full items-center justify-center p-8 text-sm text-destructive">
                    {model.message}
                </div>
            </StageShell>
        )
    }

    if (model.phase === "not-live") {
        return (
            <StageShell>
                
                <Lobby
                    data={model.lobby}
                    mc={{
                        canStart: true, // a start brings the match LIVE first
                        opensMatch: true,
                        busy: model.busy,
                        onStart: model.onStart,
                    }}
                    hint={
                        <span className="flex max-w-[60cqw] flex-col items-center gap-[0.8cqw]">
                            <span>Trận chưa LIVE — chọn vòng để bắt đầu (trận sẽ được mở cùng lúc).</span>
                            {model.startError ? (
                                <span role="alert" className="text-destructive" style={{ fontSize: pt(12) }}>
                                    {model.startError}
                                </span>
                            ) : null}
                        </span>
                    }
                />
            </StageShell>
        )
    }

    if (model.phase === "lobby") {
        return (
            <StageShell>
                <Lobby
                    data={model.lobby}
                    mc={{
                        canStart: true, // match is LIVE (the live read exists) — version in hand
                        busy: model.busy,
                        onStart: model.onStart,
                    }}
                    hint={
                        model.startError ? (
                            <span role="alert" className="text-destructive">
                                {model.startError}
                            </span>
                        ) : undefined
                    }
                />
                <ConsoleToolbar
                    tournamentId={tournamentId}
                    matchId={matchId}
                    host={model.host}
                />
            </StageShell>
        )
    }

    const { facts, roundModule } = model
    const screen = roundModule
        ? roundModule.render(facts)
        : (
            <StageLayout>
                <Badges round={ROUND_LABEL[facts.v.roundId] ?? facts.v.roundId} onRoundClick={facts.openRounds} />
                <p className="font-sans text-muted-foreground" style={{ fontSize: pt(14) }}>
                    Đang chờ dữ liệu vòng…
                </p>
            </StageLayout>
        )
    return (
        <ConsoleHostContext.Provider value={{ tournamentId, matchId, host: model.host }}>
            <StageShell>
                {screen}
                {model.adjustFor && (
                    <AdjustScoreDialog
                        playerName={facts.baseCards.find((c) => c.id === model.adjustFor)?.name ?? model.adjustFor}
                        onCancel={model.closeAdjust}
                        onSubmit={model.submitAdjust}
                    />
                )}
            </StageShell>
        </ConsoleHostContext.Provider>
    )
}
