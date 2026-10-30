import { useEffect, useState } from "react"
import { useCountdown, useServerClock } from "@shared/lib/clock"
import type { CardData, ConsoleFacts } from "@/components/stage/deck"
import { valueText } from "@/components/stage/ledger"
import { isKnownRound, isWaitingStage } from "@shared/deck/geometry"
import { ketThucPlanOf, nextQuestionPlanOf, railVariantOf, roundModuleOf, type RoundModule } from "@/rounds"
import {
    startActionPayload,
    useLive,
    useLiveAction,
    useLobby,
    useQuestionAnswers,
    type GiaiMaMc,
    type LobbyData,
    type VeDichMc,
} from "@/lib/live"
import { useMatches } from "@/lib/tournament"
import { fetchOperatorRtcToken, fetchViewerRtcToken, useRtcPeerTracks, useRtcRoom } from "@shared/lib/rtc"
import { useApiSurface } from "@/lib/surface"
import { expandRoundEntries, navigatorStartPlan } from "./navigator-plan"

// The CONTROLLER's model — every hook, derived fact and action the portal's
// match control needs. No JSX lives here: the controller host draws whichever
// phase this returns, and `rounds/*` draws the deck itself from `facts`.

interface WatchState { qid: string | null; running: boolean; startedAt: number; base: number; shown: number }
const freshWatch = (qid: string | null): WatchState => ({ qid, running: false, startedAt: 0, base: 0, shown: 0 })

export type ConsoleModel = {
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
    /** the match is not LIVE yet — waiting lobby, starts disabled */
    | { phase: "not-live"; lobby: LobbyData }
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
    const live = useLive(tournamentId, matchId)
    const matches = useMatches(tournamentId)
    const writer = useLiveAction(tournamentId, matchId)
    const clock = useServerClock()
    const [roundsView, setRoundsView] = useState(false)

    const [watch, setWatch] = useState<WatchState>(() => freshWatch(null))
    // The MC NAVIGATED into the current round (the lobby's round buttons) — a
    // waiting stage (e.g. a saved ENDED state re-opened for review) must still
    // show the deck. Automatic ends (Về sảnh) clear it → both surfaces fall
    // back to the lobby. Players never set it: they follow the pushed view.
    const [entered, setEntered] = useState(false)
    const [overrides, setOverrides] = useState<Record<string, boolean>>({})
    const [selectedQ, setSelectedQ] = useState<string | null>(null)
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
    const [adjustFor, setAdjustFor] = useState<string | null>(null)
    const oralQuestionId = live.data?.projection.oral?.questionId ?? null
    const effWatch = watch.qid === oralQuestionId ? watch : freshWatch(oralQuestionId)

    useEffect(() => {
        if (!watch.running) return
        const id = setInterval(() => {
            setWatch((w) => (w.running ? { ...w, shown: w.base + (Date.now() - w.startedAt) } : w))
        }, 250)
        return () => clearInterval(id)
    }, [watch.running])

    const v = live.data
    const roundId = v?.roundId ?? ""
    const projection = v?.projection
    const stage = projection?.stage ?? "pending"
    const open = projection?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, clock)

    // The ledger reads ITS question — one hook, one derived id (no hooks in loops).
    const judgingId =
        v && (roundId === "khoi-dong" || roundId === "but-pha")
            ? open.some((q) => q.questionId === selectedQ)
                ? selectedQ
                : open[0]?.questionId ?? null
            : null
    const resolvingId = v && roundId === "ve-dich" && open.length > 0 ? open[0].questionId : null
    const answers = useQuestionAnswers(tournamentId, matchId, judgingId ?? resolvingId)
    const rows = answers.data ?? []

    const surface = useApiSurface()
    const rtc = useRtcRoom({
        enabled: Boolean(live.data),
        autoSubscribe: true,
        // The spectator has no portal session — its door is the public viewer
        // token (video only: Discord carries the show's audio).
        getToken: () =>
            surface === "spectate"
                ? fetchViewerRtcToken(matchId)
                : fetchOperatorRtcToken(tournamentId, matchId),
    })
    const peers = useRtcPeerTracks(rtc.room)

    // An ended/unknown/pending stage is the WAITING ROOM (same rule the player
    // surface has) — exit a round and both sides land on the lobby, never a
    // dead screen. The controller routes manually from its round buttons.
    const roundScreenReady = (entered || !isWaitingStage(stage)) && isKnownRound(roundId) && !roundsView
    const viewPainted = projection !== undefined
    const transportRefused = live.isError
    const waiting = transportRefused || !viewPainted || !roundScreenReady
    const lobby = useLobby(tournamentId, matchId, waiting)

    // ── derived facts ─────────────────────────────────────────────────────────
    const userSeats = (matches.data?.items.find((m) => m.id === matchId)?.players ?? [])
        .flatMap((seat) => ("userId" in seat && seat.userId ? [seat.userId] : []))
    const questions = v?.questions ?? []
    const table = projection?.table ?? []
    const mcGiaiMa = roundId === "giai-ma" ? (v?.mc as GiaiMaMc | null) : null
    const mcVeDich = roundId === "ve-dich" ? (v?.mc as VeDichMc | null) : null

    const byId = (id: string) => questions.find((q) => q._id === id) ?? null
    const send = (act: Record<string, unknown>) =>
        writer.mutate({ expectedVersion: v!.version, action: act })
    /** Sequential actions, each carrying the version the previous one returned. */
    const sendChain = async (actions: Record<string, unknown>[]) => {
        let ver = v!.version
        for (const action of actions) {
            try {
                const res = await writer.mutateAsync({ expectedVersion: ver, action })
                ver = typeof res?.version === "number" ? res.version : ver + 1
            } catch {
                return // onError already invalidated + set the refusal flash
            }
        }
    }

    // `shown` comes from the interval — render stays pure (no Date.now here):
    // the stopwatch reads the clock only inside this state updater.
    const watchMs = effWatch.shown
    const toggleWatch = () =>
        setWatch((w) => {
            const cur = w.qid === oralQuestionId ? w : freshWatch(oralQuestionId)
            if (!cur.running) return { ...cur, running: true, startedAt: Date.now(), base: cur.shown }
            const shown = cur.base + (Date.now() - cur.startedAt)
            return { ...cur, running: false, startedAt: 0, base: shown, shown }
        })

    // verdict target = clicked card, else the first answering player
    const target = selectedPlayer && rows.some((r) => r.userId === selectedPlayer)
        ? selectedPlayer
        : rows[0]?.userId ?? null
    const setVerdict = (correct: boolean) => {
        if (!judgingId && !resolvingId) return
        const qid = judgingId ?? resolvingId!
        if (!target) return
        setOverrides((o) => ({ ...o, [`${qid}:${target}`]: correct }))
    }
    const verdictOf = (qid: string, uid: string): "CORRECT" | "INCORRECT" | null => {
        const key = `${qid}:${uid}`
        if (key in overrides) return overrides[key] ? "CORRECT" : "INCORRECT"
        return rows.find((r) => r.userId === uid)?.verdict ?? null
    }

    const railVariant = railVariantOf({ roundId, stage, veDichPhase: mcVeDich ? mcVeDich.phase : null })

    const openRounds = () => setRoundsView(true)

    // score.adjust: the controller's match-level correction — one audited row
    // (backend ledger) that folds into the scoreboard and the final results.
    const openAdjust = (userId: string) => setAdjustFor(userId)
    const closeAdjust = () => setAdjustFor(null)
    const submitAdjust = (delta: number, reason: string) => {
        if (!adjustFor) return
        setAdjustFor(null) // the refusal flash carries any failure
        send({ kind: "score.adjust", userId: adjustFor, delta, reason })
    }

    /** ve-dich only: finish the current TURN — verdicts first (the round module
     *  owns the rule; ending the ROUND is ketThuc's job). */
    const hetLuot = () => {
        if (!mcVeDich || open.length === 0) return
        const qid = open[0].questionId
        const action = roundModuleOf(roundId)?.hetLuotAction?.({
            answererVerdict: mcVeDich.answererId ? verdictOf(qid, mcVeDich.answererId) : null,
            buzzerId: mcVeDich.buzzerId,
            buzzerVerdict: mcVeDich.buzzerId ? verdictOf(qid, mcVeDich.buzzerId) : null,
        }) ?? null
        if (action) send(action)
    }

    /** Everything the round planners decide on — gathered once per call. */
    const planInput = () => ({
        stage,
        hasOralRun: Boolean(projection?.oral),
        openIds: open.map((q) => q.questionId),
        openQuestionPosition: open.length > 0 ? byId(open[0].questionId)?.position ?? null : null,
        rows,
        overrides,
    })

    /** Kết thúc = end the round in ONE press — the round module decides WHAT. */
    const ketThuc = () => {
        // The round is already finished → pure navigation back to the lobby.
        if (stage === "ended") {
            setEntered(false)
            return
        }
        const plan = ketThucPlanOf(roundId, planInput())
        // Ending plans drop the intent flag so the pushed "ended" view lands
        // both surfaces on the lobby; phase-advancing plans (khoi-dong phase 1)
        // keep it — we're still inside the round.
        if (plan.some((action) => typeof action.kind === "string" && action.kind.endsWith("endRound"))) setEntered(false)
        if (plan.length > 1) return void sendChain(plan)
        if (plan.length === 1) return send(plan[0])
    }

    /** Tính giờ — but-pha picks a NEW question: commit the current one, advance, open. */
    const pickQuestion = () => {
        const plan = nextQuestionPlanOf(roundId, planInput())
        if (plan.length > 1) return void sendChain(plan)
        if (plan.length === 1) return send(plan[0])
    }

    // ── rail cards per round screen ────────────────────────────────────────────
    const railQ = judgingId ?? resolvingId
    const railQuestion = railQ ? byId(railQ) : null
    const baseCards: CardData[] = table.map((t) => {
        const row = rows.find((r) => r.userId === t.id)
        const isTarget = target === t.id && (judgingId || resolvingId) !== null
        const card: CardData = {
            id: t.id,
            name: t.displayName,
            points: t.points,
            ring: isTarget ? "selected" : undefined,
            connected: v?.connected?.includes(t.id) ?? false,
            // identity === user id → the player's camera joins by plain equality
            video: peers.get(t.id)?.video ?? null,
        }
        if (railVariant === "answers" && railQ) {
            card.answer = row ? valueText(row, railQuestion) : "—"
            card.value = row ? (row.pointsAwarded !== null ? String(row.pointsAwarded) : row.verdict === null ? "…" : valueText(row, railQuestion)) : "—"
            card.verdict = verdictOf(railQ, t.id)
        }
        if (roundId === "giai-ma" && mcGiaiMa) {
            const p = mcGiaiMa.players.find((pl) => pl.id === t.id)
            if (p?.keywordLocked) card.badge = { text: "Giải mật mã", tone: "primary" }
            if (p?.eliminated) card.dimmed = true
        }
        if (roundId === "ve-dich" && mcVeDich?.power && mcVeDich.answererId === t.id) {
            card.badge = mcVeDich.power === "HOPE"
                ? { text: "Bùa hy vọng", tone: "amber" }
                : { text: "Bùa bảo hộ", tone: "emerald" }
        }
        return card
    })
    // the oral round: ring the player whose run is open (oral exists only in phase 1)
    if (projection?.oral) {
        const oralPlayerId = projection.oral.playerId
        for (const c of baseCards) c.ring = c.id === oralPlayerId ? "active" : undefined
    }

    const flash = writer.isError ? (writer.error as { message?: string } | null)?.message ?? "Trạng thái đã đổi — đã tải lại" : null

    /** The rounds navigator's start click — one tested plan, one executor. */
    const onStart = (nextRoundId: string, phase?: 1 | 2) => {
        if (!lobby.data) return
        setRoundsView(false)
        setEntered(true) // navigating IN — waiting stages (saved ended) still show the deck
        const startPayload = {
            kind: `${nextRoundId}.start`,
            // The paired rounds' "· Chung/· Riêng" entry: skip the untouched
            // phase 1 in the SAME start action (the engine refuses a touched one).
            ...(phase === 2 ? { phase: 2 as const } : {}),
            ...startActionPayload(nextRoundId, userSeats, questions),
        }
        const plan = navigatorStartPlan(lobby.data, nextRoundId, startPayload)
        if (plan.length > 1) return void sendChain(plan)
        if (plan.length === 1) return send(plan[0])
    }

    // ── the phase the host draws ──────────────────────────────────────────────
    const adjust = { adjustFor, openAdjust, closeAdjust, submitAdjust } as const

    /** The lobby, ready to draw: seats + their cameras, the Khởi động/Về đích
     *  phase pairs, and which phase this surface is standing in. */
    const stagePhase: 1 | 2 | null = stage === "phase1" ? 1 : stage === "phase2" ? 2 : null
    const prepareLobby = (l: LobbyData): LobbyData => ({
        ...l,
        currentPhase: stagePhase,
        rounds: expandRoundEntries(l.rounds),
        table: l.table.map((r) => ({ ...r, video: peers.get(r.id)?.video ?? null })),
    })

    if (live.isPending) return { phase: "loading", ...adjust }

    if (live.isError || !v || !projection) {
        if (lobby.data) return { phase: "not-live", lobby: prepareLobby(lobby.data), ...adjust }
        return {
            ...adjust,
            phase: "error",
            message: live.error?.message ?? "Không đọc được trạng thái vòng thi",
            retry: live.refetch,
        }
    }

    if (!roundScreenReady && lobby.data) {
        return {
            ...adjust,
            phase: "lobby",
            lobby: prepareLobby(lobby.data),
            onStart,
            busy: writer.isPending,
        }
    }

    const facts: ConsoleFacts = {
        v,
        stage,
        remaining,
        rows,
        baseCards,
        judgingId,
        target,
        setSelectedQ,
        setSelectedPlayer,
        setVerdict,
        send,
        hetLuot,
        ketThuc,
        pickQuestion,
        byId,
        verdictOf,
        watchRunning: effWatch.running,
        watchMs,
        toggleWatch,
        flash,
        openRounds,
        openAdjust,
    }
    return { phase: "deck", facts, roundModule: roundModuleOf(roundId), ...adjust }
}
