// The CONTROLLER's model — the composer.
//
// It answers exactly two questions: WHICH phase the portal shows (loading /
// error / not-live / lobby / deck), and — for the deck — the `ConsoleFacts` bag
// the round module draws from. Everything else lives where it belongs:
//
//   ./model/use-console-transport   HTTP up, socket down, the action writer, the Room
//   ./model/use-console-watch       the oral stopwatch (the only interval)
//   ./model/use-console-judging     picks, staged verdicts, the anchor answers
//   ./model/use-console-commits     giải mã's two bulk commits
//   ./model/use-console-nav         entered / atWaiting / roundsView
//   ./model/use-console-plans       Kết thúc · Tính giờ · Hết lượt · start
//   ./lib/rail-cards, ./lib/judging  pure projections (table-tested)
//
// The gate order IS the behavior, so it stays here, in one screenful: every
// early return happens after the last hook call.
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
import { railCardsOf } from "./lib/rail-cards"
import { lobbyViewOf } from "./lib/lobby-view"
import { consoleFactsOf } from "./lib/facts"
import { readinessOf } from "./lib/phase"

/** The refusal plus the reasons the API put in `details` — the useful half. */
function startRefusal(error: Error): string {
    const details = error instanceof ApiError ? error.details ?? [] : []
    return [error.message, ...details].join(" — ")
}

type ConsoleModel = {
    /** The score-adjust dialog: which player, and the callbacks the host wires. */
    adjustFor: string | null
    openAdjust: (userId: string) => void
    closeAdjust: () => void
    submitAdjust: (delta: number, reason: string) => void
} & (
    /** the first GET/push has not painted yet */
    | { phase: "loading" }
    /** transport failed and no lobby answered — say why, offer a retry */
    | { phase: "error"; message: string; retry: () => void }
    /**
     * The match is not LIVE yet. The console is the operator's screen, so it is
     * also where the match starts — sending them to another page to press one
     * button was the reason this phase looked like "we're not in the controller".
     */
    | {
        phase: "not-live"
        lobby: LobbyData
        /** UPCOMING → LIVE; refused (409) when seats or questions are missing */
        start: () => void
        starting: boolean
        startError: string | null
    }
    /** a round is (re)selectable: the waiting room with the rounds navigator */
    | {
        phase: "lobby"
        lobby: LobbyData
        onStart: (roundId: string, phase?: 1 | 2) => void
        busy: boolean
    }
    /** a round is running — the round module draws the controller's screen */
    | { phase: "deck"; facts: ConsoleFacts; roundModule: RoundModule | null }
)

export function useConsoleModel(tournamentId: string, matchId: string): ConsoleModel {
    // ── hooks first — early returns belong to the HOST, not here ────────────
    const transport = useConsoleTransport(tournamentId, matchId)
    const { live, writer, v, projection, roundId, stage, open, questions, table, byId, peers, send, sendChain } = transport

    const nav = useConsoleNav()
    // Starting the match is a MATCH transition (not a live action), so it lives by
    // the transport rather than in the action writer.
    const transition = useTransitionMatch(tournamentId)
    // The stopwatch is scoped to the open oral run (null → a stopped, empty watch).
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

    // The round console projections — each only exists for ITS round.
    const consoleGiaiMa = roundId === "giai-ma" ? (v?.console as GiaiMaConsole | null) : null
    const consoleVeDich = roundId === "ve-dich" ? (v?.console as VeDichConsole | null) : null
    const consoleKhoiDong = roundId === "khoi-dong" ? (v?.console as KhoiDongConsole | null) : null
    const railVariant = railVariantOf({ roundId, stage, veDichPhase: consoleVeDich ? consoleVeDich.phase : null })

    // ── the gate: which phase the host draws ──────────────────────────────────
    const readiness = readinessOf({
        entered: nav.entered,
        atWaiting: nav.atWaiting,
        roundsView: nav.roundsView,
        roundId,
        stage,
        viewPainted: projection !== undefined,
        transportRefused: live.isError,
    })
    // The lobby answers BOTH "not live yet" and "between rounds" — one query.
    const lobby = useLobby(tournamentId, matchId, readiness.waiting)

    // ── the plans (they need the gate's inputs, so they come after it) ────────
    const plans = useConsolePlans({
        transport,
        judging,
        veDich: consoleVeDich,
        lobby: lobby.data ?? null,
        nav,
    })

    // ── score.adjust: the controller's match-level correction ─────────────────
    const adjust = useConsoleAdjust(send)

    /** The lobby, ready to draw: seats + their cameras, the Khởi động/Về đích
     *  phase pairs, and which phase this surface is standing in. */
    const stagePhase: 1 | 2 | null = stage === "phase1" ? 1 : stage === "phase2" ? 2 : null
    const prepareLobby = (l: LobbyData): LobbyData =>
        lobbyViewOf({ lobby: l, stagePhase, videoOf: (id) => peers.get(id)?.video ?? null })

    if (live.isPending) return { phase: "loading", ...adjust }

    if (live.isError || !v || !projection) {
        if (lobby.data) {
            return {
                ...adjust,
                phase: "not-live",
                lobby: prepareLobby(lobby.data),
                start: () =>
                    transition.mutate(
                        { matchId, status: "LIVE" },
                        // the live read is what this phase is waiting on: re-read it
                        { onSuccess: () => void live.refetch() }
                    ),
                starting: transition.isPending,
                // The API answers NOT_READY with the reasons in `details` ("no
                // questions assembled", "seats: 3"). They are the whole point of the
                // refusal, so they travel with it.
                startError: transition.isError ? startRefusal(transition.error) : null,
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
        }
    }

    // ── the deck ──────────────────────────────────────────────────────────────
    // The card projection is pure logic (console/lib/rail-cards): the round
    // decides rings/badges, the caller resolves verdicts (overrides outrank the
    // submitted row), the rail only draws.
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
        connected: v.connected ?? [],
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
    return { phase: "deck", facts, roundModule: roundModuleOf(roundId), ...adjust }
}
