import type { ReactNode } from "react"
import { Badges, StageLayout } from "@/components/stage/deck"
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { ROUND_LABEL, pt } from "@shared/deck/geometry"
import { useGlow, glowKeyOf, type GlowKey } from "@shared/lib/glow"
import { Button } from "@shared/ui/button"
import { AdjustScoreDialog } from "./AdjustScoreDialog"
import { AssistantSheet } from "./AssistantSheet"
import { RegradeDialog } from "./RegradeDialog"
import { useConsoleModel, type ConsoleControl } from "./use-console-model"
import { ConsoleControlContext } from "./control-context"

function ControlBanner({ control }: { control: ConsoleControl }) {
    if (!control.blocked) return null
    return (
        <div
            role="status"
            className="absolute inset-x-0 top-0 z-40 flex flex-wrap items-center justify-center gap-3 border-b border-amber-600/40 bg-amber-500/10 px-3 py-2 text-center font-sans text-xs text-amber-800 backdrop-blur dark:text-amber-400"
        >
            <span>
                Đang điều khiển: <b>{control.controllerName}</b> — mỗi trận chỉ có một người điều hành.
            </span>
            <Button size="sm" variant="outline" onClick={control.takeover}>
                Nhận quyền điều khiển
            </Button>
        </div>
    )
}


export function Controller({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
    const model = useConsoleModel(tournamentId, matchId)
    let glowKey: GlowKey = "lobby"
    if (model.phase === "deck") glowKey = glowKeyOf(model.facts.v.roundId, model.facts.stage)
    useGlow(glowKey)

    if (model.phase === "loading") {
        return (
            <StageShell fullHeight>
                <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">Đang tải vòng thi…</div>
            </StageShell>
        )
    }

    if (model.phase === "error") {
        return (
            <StageShell fullHeight>
                <div role="alert" className="flex h-full items-center justify-center p-8 text-sm text-destructive">
                    {model.message}
                </div>
            </StageShell>
        )
    }

    if (model.phase === "not-live") {
        return (
            <StageShell fullHeight>
                <ControlBanner control={model.control} />
                
                <Lobby
                    data={model.lobby}
                    mc={{
                        canStart: true,
                        opensMatch: true,
                        busy: model.busy,
                        onStart: model.onStart,
                    }}
                    hint={
                        <span className="flex max-w-[60cqw] flex-col items-center gap-[0.8cqw]">
                            <span>Trận chưa LIVE — chọn vòng để bắt đầu (trận sẽ được mở cùng lúc).</span>
                            {model.startError && (
                                <span role="alert" className="text-destructive" style={{ fontSize: pt(12) }}>
                                    {model.startError}
                                </span>
                            )}
                        </span>
                    }
                />
            </StageShell>
        )
    }

    if (model.phase === "lobby") {
        let startErrorHint: ReactNode = undefined
        if (model.startError) {
            startErrorHint = (
                <span role="alert" className="text-destructive">
                    {model.startError}
                </span>
            )
        }
        return (
            <StageShell fullHeight>
                <ControlBanner control={model.control} />
                <Lobby
                    data={model.lobby}
                    mc={{
                        canStart: true,
                        busy: model.busy,
                        onStart: model.onStart,
                        onEndMatch: model.endMatch,
                        endingMatch: model.endingMatch,
                    }}
                    hint={startErrorHint}
                />
            </StageShell>
        )
    }

    const { facts, roundModule } = model
    let screen: ReactNode = (
        <StageLayout>
            <Badges round={ROUND_LABEL[facts.v.roundId] ?? facts.v.roundId} />
            <p className="font-sans text-muted-foreground" style={{ fontSize: pt(14) }}>
                Đang chờ dữ liệu vòng…
            </p>
        </StageLayout>
    )
    if (roundModule) screen = roundModule.render(facts)
    return (

    <ConsoleControlContext.Provider value={model.control}>
                <StageShell fullHeight>
                    <ControlBanner control={model.control} />
                    {screen}
                    <AssistantSheet surface={model.assistant} />
                    {model.adjustFor && (
                        <AdjustScoreDialog
                            playerName={facts.baseCards.find((c) => c.id === model.adjustFor)?.name ?? model.adjustFor}
                            pending={model.adjustPending}
                            error={model.adjustError}
                            onCancel={model.closeAdjust}
                            onSubmit={model.submitAdjust}
                        />
                    )}
                    {model.regradeFor && (
                        <RegradeDialog
                            playerName={facts.baseCards.find((c) => c.id === model.regradeFor)?.name ?? model.regradeFor}
                            pending={model.regradePending}
                            error={model.regradeError}
                            rows={(facts.v.projection.answers ?? [])
                                .filter((a) => a.userId === model.regradeFor)
                                .map((a) => ({
                                    questionId: a.questionId,
                                    text: facts.byId(a.questionId)?.questionText ?? a.questionId,
                                    points: a.pointsAwarded ?? 0,
                                    roundId: facts.byId(a.questionId)?.roundId ?? "",
                                }))}
                            onCancel={model.closeRegrade}
                            onSubmit={model.submitRegrade}
                        />
                    )}
                </StageShell>
            </ConsoleControlContext.Provider>
        
    )
}
