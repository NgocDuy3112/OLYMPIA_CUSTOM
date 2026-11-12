import { useState } from "react"
import type { HostBroadcast } from "@shared/lib/rtc"
import type { ConsoleFacts } from "@/components/stage/deck"
import { railVariantOf, roundModuleOf, type RoundModule } from "@/rounds"
import { useLobby, type GiaiMaConsole, type KhoiDongConsole, type LobbyData, type VeDichConsole } from "@/lib/live"
import { useConsoleTransport } from "./model/use-console-transport"
import { useConsoleWatch } from "./model/use-console-watch"
import { useConsoleJudging } from "./model/use-console-judging"
import { useConsoleCommits } from "./model/use-console-commits"
import { useConsoleNav } from "./model/use-console-nav"
import { useConsolePlans } from "./model/use-console-plans"
import { useConsoleAdjust } from "./model/use-console-adjust"
import { useTransitionMatch } from "@/lib/tournament"
import { ApiError } from "@shared/lib/api"
import { navigatorStartPlan } from "./navigator-plan"
import { startAction } from "@/lib/live-actions"
import { railCardsOf } from "./lib/rail-cards"
import { lobbyViewOf } from "./lib/lobby-view"
import { consoleFactsOf } from "./lib/facts"
import { readinessOf } from "./lib/phase"

function startRefusal(error: Error): string {
    const details = error instanceof ApiError ? error.details ?? [] : []
    return [error.message, ...details].join(" — ")
}

type ConsoleModel = {
    adjustFor: string | null
    openAdjust: (userId: string) => void
    closeAdjust: () => void
    submitAdjust: (delta: number, reason: string) => void
} & (
    | { phase: "loading" }
    /** transport failed and no lobby answered — say why, offer a retry */
    | { phase: "error"; message: string; retry: () => void }
    /**
     * The match is not LIVE yet — the SAME waiting room as between rounds, because
     * the operator's unit of work is the ROUND, not the match. Picking one brings
     * the match LIVE and starts it in one gesture; making them press "start the
     * match" first was a step the show never has.
     */
    | {
        phase: "not-live"
        lobby: LobbyData
        onStart: (roundId: string, phase?: 1 | 2) => void
        busy: boolean
        startError: string | null
    }
    /** a round is (re)selectable: the waiting room with the rounds navigator */
    | {
        phase: "lobby"
        lobby: LobbyData
        onStart: (roundId: string, phase?: 1 | 2) => void
        busy: boolean
        startError: string | null
        host: HostBroadcast
    }
    /** a round is running — the round module draws the controller's screen */
    | { phase: "deck"; facts: ConsoleFacts; roundModule: RoundModule | null; host: HostBroadcast }
)

export function useConsoleModel(tournamentId: string, matchId: string): ConsoleModel {
    const transport = useConsoleTransport(tournamentId, matchId)
    const { live, writer, v, projection, roundId, stage, open, questions, table, byId, peers, send, sendChain, userSeats } = transport

    const nav = useConsoleNav()
    const transition = useTransitionMatch(tournamentId)
    const [starting, setStarting] = useState(false)
    const [startError, setStartError] = useState<string | null>(null)
    const watch = useConsoleWatch(v?.projection.oral?.questionId ?? null)
    const judging = useConsoleJudging({ tournamentId, matchId, roundId, questions, openIds: open.map((q) => q.questionId) })
    const { rows, judgingId, resolvingId, keywordQuestionId, selectedIds, target, verdictOf } = judging
    const commits = useConsoleCommits({
        roundId,
        rows,
        openCount: open.length,
        judgingId,
        keywordQuestionId,
        selectedIds,
        send,
        sendChain,
    })

    const consoleGiaiMa = roundId === "giai-ma" ? (v?.console as GiaiMaConsole | null) : null
    const consoleVeDich = roundId === "ve-dich" ? (v?.console as VeDichConsole | null) : null
    const consoleKhoiDong = roundId === "khoi-dong" ? (v?.console as KhoiDongConsole | null) : null
    const railVariant = railVariantOf({ roundId, stage, veDichPhase: consoleVeDich ? consoleVeDich.phase : null })

    const readiness = readinessOf({
        entered: nav.entered,
        atWaiting: nav.atWaiting,
        roundsView: nav.roundsView,
        roundId,
        stage,
        viewPainted: projection !== undefined,
        transportRefused: live.isError,
    })
    const lobby = useLobby(tournamentId, matchId, readiness.waiting)

    const plans = useConsolePlans({
        transport,
        judging,
        veDich: consoleVeDich,
        lobby: lobby.data ?? null,
        nav,
        onStartError: setStartError,
    })

    const adjust = useConsoleAdjust(send)

    const stagePhase: 1 | 2 | null = stage === "phase1" ? 1 : stage === "phase2" ? 2 : null
    const prepareLobby = (l: LobbyData): LobbyData =>
        lobbyViewOf({ lobby: l, stagePhase, videoOf: (id) => peers.get(id)?.video ?? null })

    if (live.isPending) return { phase: "loading", ...adjust }

    if (live.isError || !v || !projection) {
        if (lobby.data) {
            const startFromWaiting = async (roundId: string, phase?: 1 | 2) => {
                if (starting) return
                setStarting(true)
                setStartError(null)
                try {
                    await transition.mutateAsync({ matchId, status: "LIVE" })
                    const fresh = await live.refetch()
                    const version = fresh.data?.version
                    if (version === undefined) throw new Error("Trận chưa sẵn sàng — thử lại.")

                    const plan = navigatorStartPlan(
                        lobby.data!,
                        roundId,
                        startAction(roundId, { phase, playerIds: userSeats, questions })
                    )
                    let next = version
                    for (const action of plan) {
                        const res = await writer.mutateAsync({ expectedVersion: next, action })
                        next = typeof res?.version === "number" ? res.version : next + 1
                    }
                    nav.enterRound()
                } catch (error) {
                    setStartError(startRefusal(error instanceof Error ? error : new Error("Không bắt đầu được vòng")))
                } finally {
                    setStarting(false)
                }
            }

            return {
                ...adjust,
                phase: "not-live",
                lobby: prepareLobby(lobby.data),
                onStart: (roundId: string, phase?: 1 | 2) => void startFromWaiting(roundId, phase),
                busy: starting,
                startError,
            }
        }
        return {
            ...adjust,
            phase: "error",
            message: live.error?.message ?? "Không đọc được trạng thái vòng thi",
            retry: live.refetch,
        }
    }

    if (!readiness.roundScreenReady && lobby.data) {
        return {
            ...adjust,
            phase: "lobby",
            lobby: prepareLobby(lobby.data),
            onStart: plans.onStart,
            busy: writer.isPending,
            startError,
            host: transport.host,
        }
    }

    const railQ = judgingId ?? resolvingId
    const baseCards = railCardsOf({
        table,
        rows,
        roundId,
        railVariant,
        railQ,
        railQuestion: railQ ? byId(railQ) : null,
        judgingId,
        resolvingId,
        target,
        selectedIds,
        videoOf: (id) => peers.get(id)?.video ?? null,
        verdictOf,
        giaiMa: consoleGiaiMa,
        veDich: consoleVeDich,
        khoiDong: consoleKhoiDong,
        oralPlayerId: projection.oral?.playerId ?? null,
    })

    const facts = consoleFactsOf({
        transport,
        baseCards,
        stage,
        judging,
        commits,
        plans,
        nav,
        watch,
        openAdjust: adjust.openAdjust,
    })
    return { phase: "deck", facts, roundModule: roundModuleOf(roundId), host: transport.host, ...adjust }
}
