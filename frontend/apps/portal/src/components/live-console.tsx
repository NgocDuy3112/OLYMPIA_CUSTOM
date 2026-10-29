import { useEffect, useState, type ReactNode } from "react"
import { useCountdown, useServerClock } from "@shared/lib/clock"
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import {
    Badges,
    Box,
    MainCard,
    type CardData,
    type DeckCtx,
    type SlideId,
} from "@/components/stage/deck"
import { valueText } from "@/components/stage/ledger"
import { DECK_PAD, ROUND_LABEL, isKnownRound, pt } from "@shared/deck/geometry"
import { KhoiDongChungScreen } from "@/components/stage/screens/KhoiDongChungScreen"
import { KhoiDongRiengScreen } from "@/components/stage/screens/KhoiDongRiengScreen"
import { GiaiMaScreen } from "@/components/stage/screens/GiaiMaScreen"
import { ButPhaScreen } from "@/components/stage/screens/ButPhaScreen"
import { VeDichChungScreen } from "@/components/stage/screens/VeDichChungScreen"
import { VeDichPickScreen } from "@/components/stage/screens/VeDichPickScreen"
import { VeDichRiengScreen } from "@/components/stage/screens/VeDichRiengScreen"
import {
    mergedVerdicts,
    startActionPayload,
    useLive,
    useLiveAction,
    useLobby,
    useQuestionAnswers,
    type GiaiMaMc,
    type VeDichMc,
} from "@/lib/live"
import { useMatches } from "@/lib/tournament"


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
    const [bp, setBp] = useState({ roundId: "", done: 0 })
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
    // but-pha mirror: valid only for the round it was recorded in (derived reset)
    const bpDone = bp.roundId === roundId ? bp.done : 0
    const projection = v?.projection
    const stage = projection?.stage ?? "pending"
    const open = projection?.open ?? []
    const roundEnded = v?.roundEnded ?? false
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


    // A round screen exists only while a KNOWN round is running with the rounds
    // navigator closed — in every other state the LOBBY is the screen.
    const roundScreenReady = stage !== "pending" && isKnownRound(roundId) && !roundsView
    const viewPainted = projection !== undefined // the GET/push has not delivered a view yet
    const transportRefused = live.isError
    const waiting = transportRefused || !viewPainted || !roundScreenReady
    const lobby = useLobby(tournamentId, matchId, waiting)

    // ── early returns (hooks above never move) ────────────────────────────────
    if (live.isPending) {
        return (
            <StageShell>
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Đang tải vòng thi…</div>
            </StageShell>
        )
    }
    if (live.isError || !v || !projection) {
        // The expected waiting case — match not LIVE yet (/live 404s) — is the
        // LOBBY, not an error. Any OTHER failure (401/403/500) stays an error
        // unless the lobby answered too, in which case trust the lobby.
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

    // `shown` comes from the interval — render stays pure (no Date.now here).
    const watchMs = effWatch.shown
    const freshWatchMs = () =>
        effWatch.running ? effWatch.base + (Date.now() - effWatch.startedAt) : effWatch.shown
    const toggleWatch = () =>
        setWatch((w) => {
            const cur = w.qid === oralQuestionId ? w : freshWatch(oralQuestionId)
            return cur.running
                ? { ...cur, running: false, startedAt: 0, base: freshWatchMs(), shown: freshWatchMs() }
                : { ...cur, running: true, startedAt: Date.now(), base: cur.shown }
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

    // overrides grouped per question — the commit set for KẾT THÚC's chain
    const overriddenQs = () => {
        const grouped = new Map<string, Array<{ playerId: string; correct: boolean }>>()
        for (const [key, correct] of Object.entries(overrides)) {
            const idx = key.indexOf(":")
            const qid = key.slice(0, idx)
            const uid = key.slice(idx + 1)
            if (!grouped.has(qid)) grouped.set(qid, [])
            grouped.get(qid)!.push({ playerId: uid, correct })
        }
        return grouped
    }

    let slide: SlideId
    if (roundId === "giai-ma") slide = 3
    else if (roundId === "but-pha") slide = 4
    else if (roundId === "ve-dich") {
        const phase2 = mcVeDich?.phase === 2
        slide = open.length > 0 ? (phase2 ? 8 : 7) : phase2 ? 5 : 6
    } else slide = stage === "phase2" ? 2 : 1

    const railVariant: "compact" | "answers" =
        slide === 1 || slide === 5 || slide === 8 ? "compact" : "answers"

    const openRounds = () => setRoundsView(true)

    /** ve-dich only: finish the current TURN — the open question, verdicts first.
     *  (Ending the whole round is ketThuc's job — the two are separate buttons.) */
    const hetLuot = () => {
        if (!mcVeDich || open.length === 0) return
        const qid = open[0].questionId
        const answerer = mcVeDich.answererId
        if (!answerer || verdictOf(qid, answerer) === null) return // verdict needed first
        const payload: Record<string, unknown> = { kind: "ve-dich.resolve", answerer: verdictOf(qid, answerer) === "CORRECT" }
        if (mcVeDich.buzzerId) {
            const b = verdictOf(qid, mcVeDich.buzzerId)
            if (b === null) return
            payload.buzzer = b === "CORRECT"
        }
        send(payload)
    }

    const ketThuc = () => {
        if (roundEnded) return send({ kind: "round.advance" })
        switch (roundId) {
            case "khoi-dong": {
                if (stage === "phase1") {
                    return projection.oral
                        ? send({ kind: "khoi-dong.timeOutRun" })
                        : send({ kind: "khoi-dong.beginPhase2" })  // phase 1 complete
                }
                // phase 2: commit overrides, then end (endKhoiDong closes the window too)
                const chains: Record<string, unknown>[] = []
                for (const [qid, verdicts] of overriddenQs()) {
                    if (open.some((q) => q.questionId === qid)) chains.push({ kind: "khoi-dong.finalize", questionId: qid, verdicts })
                }
                chains.push({ kind: "khoi-dong.endRound" })
                return void sendChain(chains)
            }
            case "giai-ma":
                return open.length > 0
                    ? send({ kind: "giai-ma.closeHintWindow" })
                    : send({ kind: "giai-ma.endRound" })
            case "but-pha": {
                if (open.length === 0) return send({ kind: "but-pha.endRound" })
                // finalize once (engine refuses a second time), then close — server checks UNJUDGED
                const chains: Record<string, unknown>[] = []
                if (rows.length > 0 && rows.some((r) => !r.judged)) {
                    chains.push({ kind: "but-pha.finalize", questionId: open[0].questionId, verdicts: mergedVerdicts(open[0].questionId, rows, overrides) })
                }
                chains.push({ kind: "but-pha.closeQuestion" })
                setBp({ roundId, done: Math.min(4, (bp.roundId === roundId ? bp.done : 0) + 1) })
                return void sendChain(chains)
            }
            default:
                // ve-dich: the TURN is hetLuot's job — this ends the whole round
                // (the engine closes any open question with it).
                return send({ kind: "ve-dich.endRound" })
        }
    }

    // ── rail cards per slide ──────────────────────────────────────────────────
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
    // S1 (phase 1): ring the player whose run is open
    if (slide === 1 && projection.oral) {
        for (const c of baseCards) c.ring = c.id === projection.oral!.playerId ? "active" : undefined
    }

    const flash = writer.isError ? (writer.error as { message?: string } | null)?.message ?? "Trạng thái đã đổi — đã tải lại" : null

    // The rounds NAVIGATOR: shown while the active round has no state (pre-start
    // or after an explicit advance) and on demand via the round badge. Every round
    // is reachable — ▶ new starts it, ✓/● parked rounds re-open their saved state
    // (round.goTo archives the round being left: no one-way doors).
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

    // ── the context every screen renders from ─────────────────────────────────
    const ctx: DeckCtx = {
        v,
        slide,
        roundEnded,
        started,
        remaining,
        questions,
        rows,
        baseCards,
        mcGiaiMa,
        mcVeDich,
        bpDone,
        judgingId,
        target,
        setSelectedQ,
        setSelectedPlayer,
        setVerdict,
        send,
        hetLuot,
        ketThuc,
        byId,
        verdictOf,
        watchRunning: effWatch.running,
        watchMs,
        toggleWatch,
        flash,
        openRounds,
    }

    // ── one pure screen per round (stage/screens) ─────────────────────────────
    let screen: ReactNode
    if (roundId === "khoi-dong") screen = ctx.slide === 1 ? <KhoiDongRiengScreen ctx={ctx} /> : <KhoiDongChungScreen ctx={ctx} />
    else if (roundId === "giai-ma") screen = <GiaiMaScreen ctx={ctx} />
    else if (roundId === "but-pha") screen = <ButPhaScreen ctx={ctx} />
    else if (roundId === "ve-dich") {
        // ve-dich: board while nothing is open, else the open question by phase
        screen = ctx.v.projection.open.length === 0
            ? <VeDichPickScreen ctx={ctx} />
            : ctx.mcVeDich?.phase === 2
                ? <VeDichRiengScreen ctx={ctx} />
                : <VeDichChungScreen ctx={ctx} />
    }
    else {
        // Unknown round, lobby still loading: hold the deck instead of a blank canvas.
        screen = (
            <MainCard>
                <Badges round={ROUND_LABEL[roundId] ?? roundId} onRoundClick={openRounds} />
                <Box x={0.59} y={1.4} w={8.0} className="font-sans text-muted-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                    Đang chờ dữ liệu vòng…
                </Box>
            </MainCard>
        )
    }

    return <StageShell>{screen}</StageShell>
}
