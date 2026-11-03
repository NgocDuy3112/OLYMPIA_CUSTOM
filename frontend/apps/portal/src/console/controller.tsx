import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { Badges, StageLayout } from "@/components/stage/deck"
import { ROUND_LABEL, pt } from "@shared/deck/geometry"
import { AdjustScoreDialog } from "./AdjustScoreDialog"
import { useConsoleModel } from "./use-console-model"

// The CONTROLLER's host: fetch → gate → let the round module draw. The UI is
// entirely `rounds/*Controller.tsx` (nothing else renders match controls); this
// file only picks which phase the portal shows. Its former display half is the
// OBS overlay's job, not a screen's.

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
                        canStart: false, // no round can start until the match is LIVE
                        onStart: () => { /* rounds come after the match is LIVE */ },
                    }}
                    hint={
                        <span className="flex flex-col items-center gap-[1.2cqw]">
                            <span>Trận chưa bắt đầu — đây là phòng điều khiển, bắt đầu trận ngay tại đây.</span>
                            <button
                                type="button"
                                onClick={model.start}
                                disabled={model.starting}
                                className="rounded-lg bg-primary px-[1.4cqw] py-[0.6cqw] font-sans font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
                                style={{ fontSize: pt(13) }}
                            >
                                {model.starting ? "Đang bắt đầu…" : "Bắt đầu trận ▶"}
                            </button>
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
                />
            </StageShell>
        )
    }

    // A round is running — the round module draws the controller's screen;
    // an unknown round still waiting on its module holds the deck, not a blank.
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
    )
}
