import { useEffect, useState } from "react"
import type { ConsoleFacts } from "@/components/stage/deck"
import { railVariantOf, roundModuleOf, tieBreakModule, type RoundModule } from "@/rounds"
import { postControl, useLobby, type GiaiMaConsole, type KhoiDongConsole, type LobbyData, type MatchController, type VeDichConsole } from "@/lib/live"
import { useMe } from "@/lib/session"
import { useTransitionMatch } from "@/lib/tournament"
import { startAction } from "@/lib/live-actions"
import type { HostBroadcast } from "@shared/lib/rtc"
import { ApiError } from "@shared/lib/api"
import { setGlow, roundGlowOf, glowKeyOf } from "@shared/lib/glow"
import { useConsoleTransport } from "./model/use-console-transport"
import { useConsoleJudging } from "./model/use-console-judging"
import { useConsoleCommits } from "./model/use-console-commits"
import { useConsoleNav } from "./model/use-console-nav"
import { useConsolePlans } from "./model/use-console-plans"
import { useConsoleAdjust } from "./model/use-console-adjust"
import { navigatorStartPlan } from "./navigator-plan"
import { railCardsOf } from "./lib/rail-cards"
import { lobbyViewOf } from "./lib/lobby-view"
import { consoleFactsOf } from "./lib/facts"
import { readinessOf } from "./lib/phase"

function startRefusal(error: Error): string {
    let details: string[] = []
    if (error instanceof ApiError) details = error.details ?? []
    return [error.message, ...details].join(" — ")
}

export interface ConsoleControl {
    blocked: boolean
    holding: boolean
    controllerName: string | null
    takeover: () => void
}

type ConsoleModel = {
    adjustFor: string | null
    openAdjust: (userId: string) => void
    closeAdjust: () => void
    submitAdjust: (delta: number, reason: string) => void
    regradeFor: string | null
    openRegrade: (userId: string) => void
    closeRegrade: () => void
    submitRegrade: (questionId: string, delta: number) => void
    control: ConsoleControl
} & (
    | { phase: "loading" }
    | { phase: "error"; message: string; retry: () => void }
    | {
        phase: "not-live"
        lobby: LobbyData
        onStart: (roundId: string, phase?: 1 | 2) => void
        busy: boolean
        startError: string | null
    }
    | {
        phase: "lobby"
        lobby: LobbyData
        onStart: (roundId: string, phase?: 1 | 2) => void
        busy: boolean
        startError: string | null
        host: HostBroadcast
        endMatch: () => void
        endingMatch: boolean
    }
    | { phase: "deck"; facts: ConsoleFacts; roundModule: RoundModule | null; host: HostBroadcast }
)

export function useConsoleModel(tournamentId: string, matchId: string): ConsoleModel {
    const transport = useConsoleTransport(tournamentId, matchId)
    const { live, writer, v, projection, roundId, stage, open, questions, table, byId, peers, peerControls, send, sendChain, userSeats } = transport

    const nav = useConsoleNav()
    const transition = useTransitionMatch(tournamentId)
    const [starting, setStarting] = useState(false)
    const [startError, setStartError] = useState<string | null>(null)
    const judging = useConsoleJudging({
        roundId,
        questions,
        openIds: open.map((q) => q.questionId),
        answerRows: v?.projection.answers ?? [],
    })
    const { rows, judgingId, resolvingId, keywordQuestionId, selectedIds, target } = judging
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

    let consoleGiaiMa: GiaiMaConsole | null = null
    if (roundId === "giai-ma") consoleGiaiMa = v?.console as GiaiMaConsole | null
    let consoleVeDich: VeDichConsole | null = null
    if (roundId === "ve-dich") consoleVeDich = v?.console as VeDichConsole | null
    let consoleKhoiDong: KhoiDongConsole | null = null
    if (roundId === "khoi-dong") consoleKhoiDong = v?.console as KhoiDongConsole | null
    let veDichPhase: 1 | 2 | null = null
    if (consoleVeDich) veDichPhase = consoleVeDich.phase
    const railVariant = railVariantOf({ roundId, stage, veDichPhase })

    const readiness = readinessOf({
        entered: nav.entered,
        atWaiting: nav.atWaiting,
        roundId,
        stage,
        viewPainted: projection !== undefined,
        transportRefused: live.isError && !v,
    })
    const lobby = useLobby(tournamentId, matchId, readiness.waiting)

    let stagePhase: 1 | 2 | null = null
    if (stage === "phase1") stagePhase = 1
    if (stage === "phase2") stagePhase = 2
    const plans = useConsolePlans({
        transport,
        judging,
        veDich: consoleVeDich,
        currentPhase: stagePhase,
        lobby: lobby.data ?? null,
        nav,
        onStartError: setStartError,
    })

    const adjust = useConsoleAdjust(send)

    const me = useMe()
    const controller: MatchController | null = v?.controller ?? null
    const myId = me.data?.id ?? null
    const blocked = controller !== null && controller.active && myId !== null && controller.id !== myId
    let controllerName: string | null = null
    if (blocked) {
        if (controller !== null) controllerName = controller.name
    }
    const control: ConsoleControl = {
        blocked,
        holding: !blocked,
        controllerName,
        takeover: () => {
            void postControl(tournamentId, matchId, true).catch(() => {})
        },
    }

    useEffect(() => {
        if (!tournamentId || !matchId) return
        const ping = () => {
            void postControl(tournamentId, matchId, false).catch(() => {})
        }
        ping()
        const timer = setInterval(ping, 10_000)
        return () => clearInterval(timer)
    }, [tournamentId, matchId])

    const endMatch = async () => {
        if (transition.isPending) return
        try {
            await transition.mutateAsync({ matchId, status: "FINISHED" })
            setStartError(null)
            void live.refetch()
        } catch (error) {
            let cause = new Error("Không kết thúc được trận")
            if (error instanceof Error) cause = error
            setStartError(startRefusal(cause))
        }
    }

    const prepareLobby = (l: LobbyData): LobbyData =>
        lobbyViewOf({ lobby: l, stagePhase, videoOf: (id) => peers.get(id)?.video ?? null })

    if (live.isPending) return { phase: "loading", control, ...adjust }

    if (!v || !projection) {
        if (lobby.data) {
            const startFromWaiting = async (roundId: string, phase?: 1 | 2) => {
                if (control.blocked) return
                if (starting) return
                setStarting(true)
                setStartError(null)
                setGlow(roundGlowOf(roundId))
                try {
                    await transition.mutateAsync({ matchId, status: "LIVE" })
                    const fresh = await live.refetch()
                    if (fresh.data === undefined) throw new Error("Trận chưa sẵn sàng — thử lại.")

                    const plan = navigatorStartPlan(
                        lobby.data!,
                        roundId,
                        startAction(roundId, { phase, playerIds: userSeats, questions })
                    )
                    for (const action of plan) {
                        await writer.mutateAsync(action)
                    }
                    nav.enterRound()
                } catch (error) {
                    setGlow(glowKeyOf(v?.roundId ?? "", projection?.stage ?? "pending"))
                    let refusal: Error = new Error("Không bắt đầu được vòng")
                    if (error instanceof Error) refusal = error
                    setStartError(startRefusal(refusal))
                } finally {
                    setStarting(false)
                }
            }

            return {
                ...adjust,
                control,
                phase: "not-live",
                lobby: prepareLobby(lobby.data),
                onStart: (roundId: string, phase?: 1 | 2) => void startFromWaiting(roundId, phase),
                busy: starting,
                startError,
            }
        }
        return {
            ...adjust,
            control,
            phase: "error",
            message: live.error?.message ?? "Không đọc được trạng thái vòng thi",
            retry: live.refetch,
        }
    }

    if (!readiness.roundScreenReady && lobby.data) {
        return {
            ...adjust,
            control,
            phase: "lobby",
            lobby: prepareLobby(lobby.data),
            endMatch,
            endingMatch: transition.isPending,
            onStart: (roundId: string, phase?: 1 | 2) => {
                if (control.blocked) return
                setGlow(roundGlowOf(roundId))
                plans.onStart(roundId, phase)
            },
            busy: writer.isPending,
            startError,
            host: transport.host,
        }
    }

    const railQ = judgingId ?? resolvingId
    let railQuestion: ReturnType<typeof byId> = null
    if (railQ) railQuestion = byId(railQ)
    const baseCards = railCardsOf({
        table,
        rows,
        roundId,
        railVariant,
        railQ,
        railQuestion,
        judgingId,
        resolvingId,
        target,
        selectedIds,
        videoOf: (id) => peers.get(id)?.video ?? null,
        peerControls,
        keywordQuestionId: judging.keywordQuestionId,
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
        openAdjust: adjust.openAdjust,
        openRegrade: adjust.openRegrade,
    })
    const roundModule = projection.tiebreak !== undefined ? tieBreakModule : roundModuleOf(roundId)
    return { phase: "deck", control, facts, roundModule, host: transport.host, ...adjust }
}
