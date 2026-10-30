import { useEffect, useState, type ReactNode } from "react"
import { useCountdown, useServerClock } from "@shared/lib/clock"
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import {
    Badges,
    StageLayout,
    type CardData,
    type ConsoleFacts,
} from "@/components/stage/deck"
import { valueText } from "@/components/stage/ledger"
import { ROUND_LABEL, isKnownRound, isWaitingStage, pt } from "@shared/deck/geometry"
import { ketThucPlanOf, nextQuestionPlanOf, railVariantOf, roundModuleOf } from "@/rounds"
import {
    startActionPayload,
    useLive,
    useLiveAction,
    useLobby,
    useQuestionAnswers,
    type GiaiMaMc,
    type VeDichMc,
} from "@/lib/live"
import { useMatches } from "@/lib/tournament"
import { fetchOperatorRtcToken, useRtcPeerTracks, useRtcRoom } from "@shared/lib/rtc"


interface WatchState { qid: string | null; running: boolean; startedAt: number; base: number; shown: number }
const freshWatch = (qid: string | null): WatchState => ({ qid, running: false, startedAt: 0, base: 0, shown: 0 })

export function LiveConsole({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
    // ── every hook first — early returns must not move the hook line ─────────
    const live = useLive(tournamentId, matchId)
    const matches = useMatches(tournamentId)
    const writer = useLiveAction(tournamentId, matchId)
    const clock = useServerClock()
    const [roundsView, setRoundsView] = useState(false)

    const [watch, setWatch] = useState<WatchState>(() => freshWatch(null))
    const [overrides, setOverrides] = useState<Record<string, boolean>>({})
    const [selectedQ, setSelectedQ] = useState<string | null>(null)
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
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

    const rtc = useRtcRoom({
        enabled: Boolean(live.data),
        autoSubscribe: true,
        getToken: () => fetchOperatorRtcToken(tournamentId, matchId),
    })
    const peers = useRtcPeerTracks(rtc.room)

    // An ended/unknown/pending stage is the WAITING ROOM (same rule the player
    // surface has) — exit a round and both sides land on the lobby, never a
    // dead screen. The MC routes manually from its round buttons.
    const roundScreenReady = !isWaitingStage(stage) && isKnownRound(roundId) && !roundsView
    const viewPainted = projection !== undefined // the GET/push has not delivered a view yet
    const transportRefused = live.isError
    const waiting = transportRefused || !viewPainted || !roundScreenReady
    const lobby = useLobby(tournamentId, matchId, waiting)

    if (live.isPending) {
        return (
            <StageShell>
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Đang tải vòng thi…</div>
            </StageShell>
        )
    }
    if (live.isError || !v || !projection) {
        if (lobby.data) {
            return (
                <StageShell>
                    <Lobby
                        data={lobby.data}
                        mc={{
                            canStart: false, // no live version to guard a start until the match is LIVE
                            onStart: () => { /* disabled until LIVE */ },
                        }}
                        hint="Trận chưa bắt đầu — mở ở trang trận để chuyển sang LIVE."
                    />
                </StageShell>
            )
        }
        return (
            <StageShell>
                <div role="alert" className="flex h-full items-center justify-center p-8 text-sm text-destructive">
                    {live.error?.message ?? "Không đọc được trạng thái vòng thi"}
                </div>
            </StageShell>
        )
    }

    // ── derived facts ─────────────────────────────────────────────────────────
    const started = stage !== "pending"
    const userSeats = (matches.data?.items.find((m) => m.id === matchId)?.players ?? [])
        .flatMap((seat) => ("userId" in seat && seat.userId ? [seat.userId] : []))
    const questions = v.questions
    const table = projection.table
    const mcGiaiMa = roundId === "giai-ma" ? (v.mc as GiaiMaMc | null) : null
    const mcVeDich = roundId === "ve-dich" ? (v.mc as VeDichMc | null) : null

    const byId = (id: string) => questions.find((q) => q._id === id) ?? null
    const send = (act: Record<string, unknown>) =>
        writer.mutate({ expectedVersion: v.version, action: act })
    /** Sequential actions, each carrying the version the previous one returned. */
    const sendChain = async (actions: Record<string, unknown>[]) => {
        let ver = v.version
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

    /** ve-dich only: finish the current TURN — the open question, verdicts first.
     *  (Ending the whole round is ketThuc's job — the two are separate buttons.) */
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
        hasOralRun: Boolean(projection.oral),
        openIds: open.map((q) => q.questionId),
        openQuestionPosition: open.length > 0 ? byId(open[0].questionId)?.position ?? null : null,
        rows,
        overrides,
    })

    /** Kết thúc = end the round in ONE press — the round module decides WHAT. */
    const ketThuc = () => {
        const plan = ketThucPlanOf(roundId, planInput())
        if (plan.length > 1) return void sendChain(plan)
        if (plan.length === 1) return send(plan[0])
    }

    /** Tính giờ — but-pha picks a NEW question: commit the current one, advance, open. */
    const pickQuestion = () => {
        const plan = nextQuestionPlanOf(roundId, planInput())
            ?? [{ kind: "but-pha.openQuestion" }]
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
            connected: v.connected?.includes(t.id) ?? false,
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
    if (projection.oral) {
        for (const c of baseCards) c.ring = c.id === projection.oral!.playerId ? "active" : undefined
    }

    const flash = writer.isError ? (writer.error as { message?: string } | null)?.message ?? "Trạng thái đã đổi — đã tải lại" : null


    if (!roundScreenReady && lobby.data) {
        return (
            <StageShell>
                <Lobby
                    data={lobby.data}
                    mc={{
                        canStart: true, // match is LIVE (this view 404s otherwise) — version in hand
                        busy: writer.isPending,
                        canBack: started, // the active round has state → the deck is returnable
                        onBack: () => setRoundsView(false),
                        onStart: (roundId) => {
                            setRoundsView(false)
                            const target = lobby.data?.rounds.find((r) => r.id === roundId)
                            const isActive = lobby.data?.roundId === roundId
                            const startPayload = {
                                kind: `${roundId}.start`,
                                ...startActionPayload(roundId, userSeats, questions),
                            }
                            if (target?.status === "new" && isActive) {
                                return void send(startPayload)
                            }
                            const chain: Record<string, unknown>[] = [{ kind: "round.goTo", roundId }]
                            if (target?.status !== "ended" && target?.status !== "playing") {
                                chain.push(startPayload)
                            }
                            return void sendChain(chain)
                        },
                    }}
                    hint={started
                        ? "Chọn vòng để mở lại — ▶ vòng chưa chơi để bắt đầu"
                        : "Chọn vòng — ✓ đã chơi · ● đang dở · ▶ chưa chơi (bấm là vào được hết)."}
                />
            </StageShell>
        )
    }

    // ── everything the console knows — modules project their narrow slice ────
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
    }

    // ── one screen per round module (src/rounds owns the RULES) ──────────────
    const roundModule = roundModuleOf(roundId)
    let screen: ReactNode
    if (roundModule) {
        screen = roundModule.render(facts)
    }
    else {
        // Unknown round, lobby still loading: hold the deck instead of a blank canvas.
        screen = (
            <StageLayout>
                <Badges round={ROUND_LABEL[roundId] ?? roundId} onRoundClick={openRounds} />
                <p className="font-sans text-muted-foreground" style={{ fontSize: pt(14) }}>
                    Đang chờ dữ liệu vòng…
                </p>
            </StageLayout>
        )
    }

    return <StageShell>{screen}</StageShell>
}
