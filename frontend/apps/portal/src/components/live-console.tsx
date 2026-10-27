import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { CheckCircle2, Hourglass, XCircle } from "lucide-react"
import { formatRemaining, useCountdown, useServerClock } from "@shared/lib/clock"
import { StageShell } from "@/components/stage/StageShell"
import { Lobby } from "@/components/stage/Lobby"
import {
    mergedVerdicts,
    startActionPayload,
    useLive,
    useLiveAction,
    useLobby,
    useQuestionAnswers,
    type ConsoleQuestion,
    type GiaiMaMc,
    type QuestionAnswerRow,
    type VeDichMc,
} from "@/lib/live"
import { useMatches } from "@/lib/tournament"

// The MC's console — RESHELLED into the OC3.pptm deck layout (docs/ui-structure-plan.md
// §3). One polled read (3 s); every action carries the version it was read from; refusals
// (409 CONFLICT / engine RuleError) flash next to the strip: reject, reload, explain.
// The deck's drawn controls are the COMPLETE vocabulary (decision 3):
//
//   round badge (pending) → click = start the round (decision 4-amended: start on click,
//   turns are NEVER automatic — the user's lock)
//   KẾT THÚC = end the current unit, then (roundEnded) → round.advance (decision 5)
//   ĐÚNG/SAI = S1: recordOral immediately · S2/S4/S7/S8: set the selected card's verdict
//              (committed by KẾT THÚC's chain) · S3: SAI inert (engine auto-matches)
//   TÍNH GIỜ = S1 stopwatch · S4 openQuestion · otherwise the countdown display
//   BẮT ĐẦU = phase-2 open pending pick (S5) / beginPhase2 (S6) · CHỌN LẠI = advanceTurn
//   (S5/S6; phase-1 complete → beginPhase2) · MỞ CHUÔNC (S8) = closeCurrentAnswer → buzz
//
// ve-dich slide ↔ phase (locked): S8/S5 = phase 2 · S6/S7 = phase 1 (labels as drawn).
// Screen pick: roundId + stage/mc → slide; the board grid is built from the frozen set
// (judge's copy) × the projection's board states — no engine-shape guesses.

// ── deck geometry (OC3.pptm inches → canvas units; same math as StageShell) ──
const SLIDE_W = 13.3333
const SLIDE_H = 7.5
const px = (i: number) => `${+((i / SLIDE_W) * 100).toFixed(3)}%`
const py = (i: number) => `${+((i / SLIDE_H) * 100).toFixed(3)}%`
const PT_SCALE = 0.75
const pt = (v: number) => `${+(((v * PT_SCALE) / 72 / SLIDE_W) * 100).toFixed(3)}cqw`
const STRIP_R = `${+(((0.44 * 0.31623) / SLIDE_W) * 100).toFixed(3)}cqw`
/** PowerPoint's default text insets (verified across all 406 bodyPr in the deck). */
const DECK_PAD: CSSProperties = {
    paddingLeft: "0.75cqw",
    paddingRight: "0.75cqw",
    paddingTop: "0.375cqw",
    paddingBottom: "0.375cqw",
}

function Box({
    x, y, w, h, className = "", style, onClick, title, children,
}: {
    x: number; y: number; w?: number; h?: number
    className?: string; style?: CSSProperties; onClick?: () => void; title?: string; children?: ReactNode
}) {
    return (
        <div
            className={`absolute ${className}`}
            onClick={onClick}
            title={title}
            style={{
                left: px(x), top: py(y),
                ...(w !== undefined ? { width: px(w) } : {}),
                ...(h !== undefined ? { height: py(h) } : {}),
                ...style,
            }}
        >
            {children}
        </div>
    )
}

/** A child box in deck inches relative to its card → % of that card. */
const at = (cardW: number, cardH: number) => (x: number, y: number, w: number, h: number): CSSProperties => ({
    position: "absolute",
    left: `${+((x / cardW) * 100).toFixed(3)}%`,
    top: `${+((y / cardH) * 100).toFixed(3)}%`,
    width: `${+((w / cardW) * 100).toFixed(3)}%`,
    height: `${+((h / cardH) * 100).toFixed(3)}%`,
})

// ── deck labels ──────────────────────────────────────────────────────────────
const ROUND_LABEL: Record<string, string> = {
    "khoi-dong": "Khởi động",
    "giai-ma": "Giải mã",
    "but-pha": "Bứt phá",
    "ve-dich": "Về đích",
}

// ── small pieces ─────────────────────────────────────────────────────────────

function Badges({ round, mode, y = 0.55, size = 32 }: {
    round: string; mode?: string; y?: number; size?: number
}) {
    return (
        <>
            <Box
                x={0.59} y={y}
                className="font-display font-bold uppercase leading-none text-foreground"
                style={{ fontSize: pt(size), ...DECK_PAD }}
            >
                {round}
            </Box>
            {mode && (
                <Box x={0.6} y={y + 0.42} className="font-display font-medium leading-none text-muted-foreground" style={{ fontSize: pt(16), ...DECK_PAD }}>
                    {mode}
                </Box>
            )}
        </>
    )
}

/** Question index squares (0.26, right-aligned to x 8.62): done ▸ active ▸ pending. */
function Progress({ total, done, active, onPick }: { total: number; done: number; active: number; onPick?: (i: number) => void }) {
    const startX = 8.46 - (total * 0.26 + (total - 1) * 0.13)
    return (
        <>
            {Array.from({ length: total }, (_, i) => (
                <Box
                    key={i}
                    x={startX + i * 0.39} y={0.78} w={0.26} h={0.26}
                    onClick={onPick ? () => onPick(i) : undefined}
                    className={`flex items-center justify-center font-display font-bold leading-none ${i < done
                            ? "bg-primary text-primary-foreground"
                            : i === active
                                ? "bg-card text-foreground ring-2 ring-primary"
                                : "bg-card text-muted-foreground ring-1 ring-border"
                        } ${onPick ? "cursor-pointer hover:ring-sky-500" : ""}`}
                    style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                >
                    {i + 1}
                </Box>
            ))}
        </>
    )
}

/** The timer glyph: ticking countdown when a server deadline exists, else the deck's static 45. */
function Timer({ remaining, fallback = "45", x = 8.55, y = 0.51, size = 40 }: {
    remaining: number | null; fallback?: string; x?: number; y?: number; size?: number
}) {
    const text = remaining !== null ? formatRemaining(remaining) : fallback
    return (
        <Box x={x} y={y} w={0.75} className="text-right font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
            {text}
        </Box>
    )
}

type StripItem = { label: string; content?: ReactNode; onClick?: () => void; title?: string; muted?: boolean }

/**
 * The deck's button strip — exact per-slide positions. Items without onClick render
 * as the countdown/display slot (still drawn, as in the deck).
 */
function Strip({ slide, items }: { slide: 1 | 2 | 3 | 4 | 56 | 7 | 8; items: StripItem[] }) {
    const spec: Record<number, { y: number; xs: number[] }> = {
        1: { y: 4.69, xs: [2.25, 3.59, 4.92, 6.25] },
        2: { y: 4.69, xs: [2.31, 3.65, 4.98, 6.32] },
        3: { y: 6.52, xs: [2.31, 3.65, 4.98, 6.32] },
        4: { y: 4.68, xs: [2.37, 3.71, 5.04, 6.38] },
        56: { y: 4.9, xs: [2.9, 4.21, 5.49] },
        7: { y: 4.67, xs: [2.38, 3.72, 5.05, 6.38] },
        8: { y: 4.67, xs: [1.66, 2.99, 4.31, 5.64, 6.98] },
    }
    const { y, xs } = spec[slide]
    return (
        <>
            {items.map((item, i) => (
                <Box
                    key={item.label}
                    x={xs[i]} y={y} w={1.21} h={0.44}
                    onClick={item.onClick}
                    title={item.title}
                    className={`flex items-center justify-center font-sans font-semibold uppercase tracking-wide shadow-sm ${item.onClick
                            ? "bg-primary text-primary-foreground transition hover:brightness-110"
                            : `bg-muted text-muted-foreground ring-1 ring-border ${item.muted ? "" : "tabular-nums"}`
                        } ${item.onClick ? "" : "cursor-default"}`}
                    style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                >
                    {item.content ?? item.label}
                </Box>
            ))}
        </>
    )
}

/** Status slot beside the strip: refusal flash (red) > contextual hint (muted). */
function Status({ y, error, hint }: { y: number; error?: string | null; hint?: ReactNode }) {
    return (
        <Box x={7.75} y={y} w={1.66} className="flex items-center justify-end text-right leading-tight" style={{ fontSize: pt(10), ...DECK_PAD }}>
            {error ? (
                <span role="alert" className="font-semibold text-destructive">{error}</span>
            ) : (
                <span className="text-muted-foreground">{hint}</span>
            )}
        </Box>
    )
}

function VerdictIcon({ verdict }: { verdict: "CORRECT" | "INCORRECT" | null | undefined }) {
    if (verdict === "CORRECT") return <CheckCircle2 className="size-[1.15em] shrink-0 text-emerald-600" aria-label="Đúng" />
    if (verdict === "INCORRECT") return <XCircle className="size-[1.15em] shrink-0 text-red-600" aria-label="Sai" />
    return <Hourglass className="size-[1.15em] shrink-0 text-amber-500" aria-label="Chưa chấm" />
}

// what one rail card shows
interface CardData {
    id: string
    name: string
    points: number
    answer?: string        // answer-variant bottom line
    value?: string         // answer-variant value row
    verdict?: "CORRECT" | "INCORRECT" | null
    badge?: { text: string; tone: "primary" | "amber" | "emerald" }  // keyword / power pill
    ring?: "selected" | "active"
    dimmed?: boolean       // giai-ma eliminated
    /** has a live player socket right now (the hub's connected list) */
    connected?: boolean
}

/**
 * Contestant cards (x 9.97, w 3.12) — deck internals: avatar (0.16,0.09,1.77×1.01),
 * name (1.90,0.03), points (1.9,0.24 — enlarged per user), value (1.95,0.84),
 * badge (2.05,0.88, replaces value), full-width answer (0,1.13,3.12×0.50).
 * These cards ARE the ledger: click = select the verdict target (ĐÚNG/SAI).
 */
function Rail({ variant, cards, onSelect }: { variant: "compact" | "answers"; cards: CardData[]; onSelect?: (id: string) => void }) {
    const ys = variant === "compact" ? [0.39, 1.77, 3.14, 4.55] : [0.39, 2.13, 3.86, 5.61]
    const h = variant === "compact" ? 1.24 : 1.61
    const CW = 3.12
    const centered = "flex items-start justify-center text-center leading-tight"

    return (
        <>
            {cards.map((c, i) => {
                const place = at(CW, h)
                return (
                    <Box
                        key={c.id}
                        x={9.97} y={ys[i]} w={CW} h={h}
                        onClick={onSelect ? () => onSelect(c.id) : undefined}
                        className={`overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition ${onSelect ? "cursor-pointer hover:ring-sky-400" : ""
                            } ${c.ring === "selected" ? "ring-2 ring-primary" : c.ring === "active" ? "ring-2 ring-amber-400" : ""} ${c.dimmed ? "opacity-60" : ""
                            }`}
                    >
                        <div
                            style={{ ...place(0.16, 0.09, 1.77, 1.01), fontSize: pt(20) }}
                            className="flex items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                            aria-hidden
                        >
                            {c.name.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"}
                        </div>
                        {/* connected dot — follows the player's live socket (hub state).
                            MC's read: green = at a device, gray = gone/idle. */}
                        <div
                            style={{ ...place(1.68, 0.12, 0.16, 0.16) }}
                            className={`rounded-full ring-2 ring-card ${c.connected
                                    ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                                    : "bg-muted-foreground/40"
                                }`}
                        />
                        <div style={{ ...place(1.9, 0.03, 1.19, 0.37), fontSize: pt(16) }} className={`${centered} truncate font-display font-medium text-foreground`}>
                            {c.name}
                        </div>
                        <div style={{ ...place(1.9, 0.24, 1.19, 0.6), fontSize: pt(52), ...DECK_PAD }} className={`${centered} font-display font-bold tabular-nums text-foreground`}>
                            {c.points}
                        </div>
                        {c.badge ? (
                            <div
                                style={{ ...place(2.05, 0.88, 0.96, 0.21), fontSize: pt(10) }}
                                className={`flex items-center justify-center rounded-full px-1 font-sans font-semibold ${c.badge.tone === "primary"
                                        ? "bg-primary text-primary-foreground"
                                        : c.badge.tone === "amber"
                                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-300"
                                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300"
                                    }`}
                            >
                                {c.badge.text}
                            </div>
                        ) : (
                            variant === "answers" && (
                                <div style={{ ...place(1.95, 0.84, 1.0, 0.3), fontSize: pt(12), ...DECK_PAD }} className={`${centered} gap-1 font-sans font-semibold tabular-nums text-foreground`}>
                                    <span className="truncate">{c.value ?? "—"}</span>
                                    {c.verdict !== undefined && <VerdictIcon verdict={c.verdict} />}
                                </div>
                            )
                        )}
                        {variant === "answers" && (
                            <div style={{ ...place(0, 1.13, CW, 0.5), fontSize: pt(12), ...DECK_PAD }} className="flex items-start justify-center overflow-hidden text-center font-sans leading-snug text-muted-foreground">
                                <span className="line-clamp-2">{c.answer ?? "—"}</span>
                            </div>
                        )}
                    </Box>
                )
            })}
        </>
    )
}

function MainCard({ y = 0.39, h = 4.12, children }: { y?: number; h?: number; children?: ReactNode }) {
    return (
        <>
            <Box x={0.45} y={y} w={8.96} h={h} className="rounded-2xl bg-card shadow-md ring-1 ring-border" />
            {children}
        </>
    )
}

function QuestionBlock({ question, mediaHint = "hình ảnh câu hỏi" }: { question: string; mediaHint?: string }) {
    return (
        <>
            <Box x={0.59} y={1.4} w={3.56} h={1.04} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                {question}
            </Box>
            <Box x={4.16} y={1.46} w={4.99} h={2.85} className="flex items-center justify-center rounded-2xl bg-muted ring-1 ring-border">
                <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>{mediaHint}</span>
            </Box>
        </>
    )
}

// ── what value the ledger row shows (MC options as letters) ──────────────────
function valueText(row: QuestionAnswerRow, question?: ConsoleQuestion | null): string {
    const value = row.value
    if (!value) return "—"
    if (value.text !== undefined) return `“${value.text}”`
    if (value.oral) return "nói miệng"
    if (value.picked) {
        if (!question?.payload.options) return value.picked.join(", ")
        return value.picked
            .map((id) => {
                const index = question.payload.options!.findIndex((o) => o.id === id)
                return index >= 0 ? String.fromCharCode(65 + index) : id
            })
            .join(", ")
    }
    return "—"
}

// The MC's stopwatch: `shown` is maintained by the 250 ms interval (render never
// calls Date.now), and `qid` ties it to the oral question it belongs to — a new
// question derives a fresh watch without a reset effect.
interface WatchState { qid: string | null; running: boolean; startedAt: number; base: number; shown: number }
const freshWatch = (qid: string | null): WatchState => ({ qid, running: false, startedAt: 0, base: 0, shown: 0 })

// ── the console ──────────────────────────────────────────────────────────────

type SlideId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export function LiveConsole({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
    // ── every hook first — early returns must not move the hook line ─────────
    const live = useLive(tournamentId, matchId)
    const matches = useMatches(tournamentId)
    const writer = useLiveAction(tournamentId, matchId)
    const clock = useServerClock()

    const [watch, setWatch] = useState<WatchState>(() => freshWatch(null))
    const [overrides, setOverrides] = useState<Record<string, boolean>>({})
    const [selectedQ, setSelectedQ] = useState<string | null>(null)
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
    // but-pha's cursor isn't projected between questions — mirror closes per round
    // (roundId in the value = derived reset, no setState-in-effect)
    const [bp, setBp] = useState({ roundId: "", done: 0 })

    // A new oral question derives a fresh stopwatch (no reset effect: the old watch
    // simply stops matching its qid). Overrides/selections are inert across rounds
    // (keys embed question ids; targets fall back to the current rows).
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

    // The lobby answers BOTH waiting moments: the /live 404 (match not LIVE yet)
    // and "pending" (round not started) — ask for it whenever either is true.
    // (Hook stays before the early returns like every other.)
    const waiting = live.isError || !v || !projection || stage === "pending"
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

    // ── slide derivation (ve-dich: S8/S5 = phase 2, S6/S7 = phase 1 — locked) ─
    let slide: SlideId
    if (roundId === "giai-ma") slide = 3
    else if (roundId === "but-pha") slide = 4
    else if (roundId === "ve-dich") {
        const phase2 = mcVeDich?.phase === 2
        slide = open.length > 0 ? (phase2 ? 8 : 7) : phase2 ? 5 : 6
    } else slide = stage === "phase2" ? 2 : 1

    const railVariant: "compact" | "answers" =
        slide === 1 || slide === 5 || slide === 8 ? "compact" : "answers"

    // ── the shared "KẾT THÚC" state machine (decisions 5) ─────────────────────
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
            default: {
                // ve-dich: resolve the open question, else the round is over
                if (open.length > 0 && mcVeDich) {
                    const qid = open[0].questionId
                    const answerer = mcVeDich.answererId
                    if (!answerer || verdictOf(qid, answerer) === null) return // verdict needed first
                    const payload: Record<string, unknown> = { kind: "ve-dich.resolve", answerer: verdictOf(qid, answerer) === "CORRECT" }
                    if (mcVeDich.buzzerId) {
                        const b = verdictOf(qid, mcVeDich.buzzerId)
                        if (b === null) return
                        payload.buzzer = b === "CORRECT"
                    }
                    return send(payload)
                }
                return send({ kind: "ve-dich.endRound" })
            }
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

    // Round not started (incl. between rounds after advance) → THE LOBBY with
    // the round buttons (the only start path — the deck's ▶-badge is gone); the
    // plain deck shows only while lobby data loads.
    if (!started && lobby.data) {
        return (
            <StageShell>
                <Lobby
                    data={lobby.data}
                    mc={{
                        canStart: true, // match is LIVE (this view 404s otherwise) — version in hand
                        busy: writer.isPending,
                        onStart: (roundId) =>
                            send({ kind: `${roundId}.start`, ...startActionPayload(roundId, userSeats, questions) }),
                    }}
                    hint="Chọn vòng để bắt đầu — vòng đã chơi ✓, vòng sau chờ."
                />
            </StageShell>
        )
    }

    // ── per-slide strip + screens ─────────────────────────────────────────────
    let screen: ReactNode

    if (roundId === "khoi-dong" && slide === 1) {
        const oral = projection.oral
        const overBudget = oral
            ? watchMs > Math.max(0, (oral.budgetS - oral.elapsedS) * 1000)
            : false
        screen = (
            <>
                <MainCard>
                    <Badges round="Khởi động" mode="Lượt cá nhân" />
                    <Progress total={oral?.total ?? 6} done={oral?.index ?? 0} active={oral?.index ?? 0} />
                    <Timer remaining={null} fallback={oral ? String(Math.max(0, Math.ceil(oral.budgetS - oral.elapsedS))) : "45"} />
                    <QuestionBlock question={oral?.question?.questionText ?? "Đang chuyển người chơi…"} />
                </MainCard>
                <Rail variant="compact" cards={baseCards} />
                <Strip
                    slide={1}
                    items={[
                        {
                            label: "Tính giờ",
                            content: watch.running ? `⏱ ${formatRemaining(watchMs)}` : "Tính giờ",
                            onClick: toggleWatch,
                            title: "Bấm giờ cho lượt trả lời này",
                        },
                        { label: "Đúng", onClick: oral && !overBudget ? () => send({ kind: "khoi-dong.recordOral", correct: true, spentS: Math.max(0, Math.floor(watchMs / 1000)) }) : undefined, title: overBudget ? "vượt ngân sách — dùng Kết thúc" : oral ? undefined : "không có lượt đang mở", },
                        { label: "Sai", onClick: oral && !overBudget ? () => send({ kind: "khoi-dong.recordOral", correct: false, spentS: Math.max(0, Math.floor(watchMs / 1000)) }) : undefined, title: overBudget ? "vượt ngân sách — dùng Kết thúc" : oral ? undefined : "không có lượt đang mở" },
                        { label: "Kết thúc", onClick: started ? ketThuc : undefined, title: started ? undefined : "vòng chưa bắt đầu" },
                    ]}
                />
                <Status y={5.24} error={flash} hint={overBudget ? "vượt ngân sách" : oral ? `câu ${oral.index + 1}/${oral.total}` : "chuyển người chơi…"} />
            </>
        )
    } else if (roundId === "khoi-dong" && slide === 2) {
        const activeQ = judgingId
        screen = (
            <>
                <MainCard>
                    <Badges round="Khởi động" mode="Lượt chung" />
                    <Progress total={open.length || 6} done={0} active={activeQ ? open.findIndex((q) => q.questionId === activeQ) : 0} onPick={(i) => open[i] && setSelectedQ(open[i].questionId)} />
                    <Timer remaining={remaining} />
                    <QuestionBlock question={byId(activeQ ?? open[0]?.questionId ?? "")?.questionText ?? "Cả bảng đang trả lời…"} />
                </MainCard>
                <Rail variant="answers" cards={baseCards} onSelect={setSelectedPlayer} />
                <Strip
                    slide={2}
                    items={[
                        { label: "Tính giờ", content: remaining !== null ? formatRemaining(remaining) : "60s", muted: true },
                        { label: "Đúng", onClick: target ? () => setVerdict(true) : undefined, title: target ? "chấm Đúng cho thí sinh được chọn" : "chưa có trả lời" },
                        { label: "Sai", onClick: target ? () => setVerdict(false) : undefined, title: target ? undefined : "chưa có trả lời" },
                        { label: "Kết thúc", onClick: started ? ketThuc : undefined, title: started ? undefined : "vòng chưa bắt đầu" },
                    ]}
                />
                <Status y={5.24} error={flash} hint="chọn ô để so câu khác" />
            </>
        )
    } else if (roundId === "giai-ma") {
        const keywordQ = questions.find((q) => q.roundId === "giai-ma" && q.kind === "KEYWORD")
        const keywordLength = typeof keywordQ?.payload.code === "string" ? keywordQ.payload.code.length : null
        const hintQuestions = questions
            .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
            .sort((a, b) => a.position - b.position)
        const openHintId = mcGiaiMa?.openHintId ?? null
        const tileX = [0.51, 2.83, 5.15, 7.43]
        const tileY = [1.33, 2.79]
        const tileState = (qid: string): "free" | "open" | "used" =>
            qid === openHintId ? "open" : mcGiaiMa?.hintsPicked.includes(qid) ? "used" : "free"
        screen = (
            <>
                {keywordLength !== null && (
                    <Box x={0.51} y={0.39} w={8.96} h={0.8} className="flex items-center justify-center rounded-2xl bg-card shadow-md ring-1 ring-border">
                        <span className="font-display font-bold uppercase tracking-wide text-foreground" style={{ fontSize: pt(40) }}>
                            Mật mã gồm có {keywordLength} chữ cái
                        </span>
                    </Box>
                )}
                {hintQuestions.slice(0, 8).map((q, i) => {
                    const s = tileState(q._id)
                    return (
                        <Box
                            key={q._id}
                            x={tileX[i % 4]} y={tileY[Math.floor(i / 4)]} w={2.03} h={1.32}
                            onClick={started && s === "free" ? () => send({ kind: "giai-ma.openHint", hintId: q._id }) : undefined}
                            title={s === "free" ? "Mở hint này" : s === "open" ? "cửa sổ đang mở" : "hint đã dùng"}
                            className={`flex items-center justify-center rounded-2xl font-display font-bold leading-none shadow-md ${s === "free"
                                    ? started
                                        ? "bg-card text-foreground ring-1 ring-border cursor-pointer hover:ring-sky-500"
                                        : "bg-card text-foreground ring-1 ring-border"
                                    : s === "open"
                                        ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                                        : "bg-muted text-muted-foreground ring-1 ring-border"
                                }`}
                            style={{ fontSize: pt(60) }}
                        >
                            {i + 1}
                        </Box>
                    )
                })}
                <MainCard y={4.27} h={2.08}>
                    <Badges round="Giải mã" y={4.38} size={28} />
                    <Timer y={4.38} size={32} remaining={remaining} />
                    <Box x={0.65} y={4.98} w={8.57} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                        {open.length > 0 ? open[0].question?.questionText ?? "" : "Chọn một hint để mở cửa sổ trả lời"}
                    </Box>
                </MainCard>
                <Rail variant="answers" cards={baseCards} />
                <Strip
                    slide={3}
                    items={[
                        { label: "Tính giờ", content: remaining !== null ? formatRemaining(remaining) : "15s", muted: true },
                        { label: "Đúng", onClick: started ? () => send({ kind: "giai-ma.resolveHint" }) : undefined, title: started ? "chốt hint từ sổ trả lời" : "vòng chưa bắt đầu" },
                        { label: "Sai", title: "giai mã chấm tự động — không chấm tay" },
                        { label: "Kết thúc", onClick: started ? ketThuc : undefined, title: started ? undefined : "vòng chưa bắt đầu" },
                    ]}
                />
                <Status y={7.06} error={flash} hint={open.length > 0 ? "cửa sổ hint đang mở" : `${hintQuestions.length - (mcGiaiMa?.hintsPicked.length ?? 0)} hint còn lại`} />
            </>
        )
    } else if (roundId === "but-pha") {
        const openQ = open[0] ?? null
        const pos = openQ ? (byId(openQ.questionId)?.position ?? 0) : null
        const done = roundEnded ? 4 : pos ?? bpDone
        screen = (
            <>
                <MainCard>
                    <Badges round="Bứt phá" />
                    <Progress total={4} done={done} active={pos ?? done} />
                    <Timer remaining={remaining} />
                    <QuestionBlock question={openQ?.question?.questionText ?? "Nhấn Tính giờ để mở câu tiếp theo"} />
                </MainCard>
                <Rail variant="answers" cards={baseCards} onSelect={setSelectedPlayer} />
                <Strip
                    slide={4}
                    items={[
                        openQ
                            ? { label: "Tính giờ", content: remaining !== null ? formatRemaining(remaining) : "30s", muted: true }
                            : { label: "Tính giờ", onClick: started ? () => send({ kind: "but-pha.openQuestion" }) : undefined, title: started ? "mở câu hỏi (30s)" : "vòng chưa bắt đầu" },
                        { label: "Đúng", onClick: target && openQ ? () => setVerdict(true) : undefined, title: openQ ? (target ? "chấm Đúng" : "chưa có trả lời") : "chưa mở câu" },
                        { label: "Sai", onClick: target && openQ ? () => setVerdict(false) : undefined, title: openQ ? (target ? "chấm Sai" : "chưa có trả lời") : "chưa mở câu" },
                        { label: "Kết thúc", onClick: started ? ketThuc : undefined, title: started ? "chốt & đóng câu" : "vòng chưa bắt đầu" },
                    ]}
                />
                <Status y={5.23} error={flash} hint={openQ ? `câu ${done + 1}/4` : roundEnded ? "đã hết câu" : "mở câu tiếp theo bằng Tính giờ"} />
            </>
        )
    } else if (roundId === "ve-dich" && open.length === 0) {
        // board (S5 = phase 2, S6 = phase 1 — locked): grid from the frozen set × board states
        const phase2 = mcVeDich?.phase === 2
        const boardQs = questions.filter((q) => q.roundId === "ve-dich").sort((a, b) => a.position - b.position)
        const cols = [...new Set(boardQs.map((q) => q.tag))]
        const vals = [...new Set(boardQs.map((q) => q.points))].sort((a, b) => a - b)
        const boardMap = new Map((projection.board ?? []).map((c) => [c.questionId, c.where]))
        const COL_X = [0.54, 2.03, 3.52, 5.0, 6.49, 7.97]
        const ROW_Y = [1.57, 2.31, 3.05, 3.78]
        screen = (
            <>
                <MainCard h={4.24}>
                    <Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} />
                    {boardQs.map((q) => {
                        const ci = cols.indexOf(q.tag)
                        const ri = vals.indexOf(q.points)
                        if (ci < 0 || ci > 5 || ri < 0 || ri > 3) return null
                        const where = boardMap.get(q._id) ?? "taken"
                        return (
                            <Box
                                key={q._id}
                                x={COL_X[ci]} y={ROW_Y[ri]} w={1.33} h={0.59}
                                title={where === "taken" ? "đã dùng" : where === "pending" ? "thí sinh đã chọn — chờ mở" : where === "open" ? "đang mở" : "còn trống"}
                                className={`flex flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${where === "open"
                                        ? "bg-primary text-primary-foreground ring-primary"
                                        : where === "pending"
                                            ? "bg-sky-50 ring-2 ring-sky-500 text-sky-800"
                                            : where === "free"
                                                ? "bg-card ring-border"
                                                : "bg-muted text-muted-foreground/50 ring-border"
                                    }`}
                                style={DECK_PAD}
                            >
                                <span className="truncate text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{q.tag}</span>
                                <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{q.points}</b>
                            </Box>
                        )
                    })}
                </MainCard>
                <Rail variant={phase2 ? "compact" : "answers"} cards={baseCards} />
                <Strip
                    slide={56}
                    items={[
                        {
                            label: "Bắt đầu",
                            onClick: started
                                ? phase2
                                    ? () => send({ kind: "ve-dich.openQuestion", questionId: mcVeDich?.pendingQuestionId ?? "" })
                                    : () => send({ kind: "ve-dich.beginPhase2" })
                                : undefined,
                            title: started
                                ? phase2
                                    ? mcVeDich?.pendingQuestionId
                                        ? "mở câu thí sinh đã chọn"
                                        : "thí sinh chưa chọn câu nào"
                                    : "chuyển sang lượt cá nhân (phase 2)"
                                : "vòng chưa bắt đầu",
                        },
                        {
                            label: "Chọn lại",
                            onClick: started && !roundEnded
                                ? () =>
                                    mcVeDich && mcVeDich.turnPlayerId === null && mcVeDich.phase === 1
                                        ? send({ kind: "ve-dich.beginPhase2" })
                                        : send({ kind: "ve-dich.advanceTurn" })
                                : undefined,
                            title: started ? "bỏ lượt chọn hiện tại — lượt kế" : "vòng chưa bắt đầu",
                        },
                        { label: "Kết thúc", onClick: started ? ketThuc : undefined, title: started ? undefined : "vòng chưa bắt đầu" },
                    ]}
                />
                {(() => {
                    const boardHint = !started
                        ? undefined
                        : phase2
                            ? mcVeDich?.pendingQuestionId
                                ? "có câu chờ mở"
                                : "chờ thí sinh chọn 3 câu"
                            : mcVeDich?.turnPlayerId
                                ? "chờ thí sinh chọn câu"
                                : "hết lượt — chuyển phase"
                    return <Status y={5.44} error={flash} hint={boardHint} />
                })()}
            </>
        )
    } else if (roundId === "ve-dich") {
        // question (S7 = phase 1, S8 = phase 2 — locked)
        const phase2 = mcVeDich?.phase === 2
        const stripCells = (projection.board ?? []).filter((c) => c.where !== "free").slice(0, 4)
        const stripX = phase2 ? [4.2, 5.66, 7.14] : [2.7, 4.2, 5.66, 7.14]
        const openNow = open[0]
        const qid = openNow.questionId
        const needsVerdict =
            mcVeDich?.answererId ? verdictOf(qid, mcVeDich.answererId) === null : true
        const buzzerMissing =
            mcVeDich?.buzzerId ? verdictOf(qid, mcVeDich.buzzerId) === null : false
        screen = (
            <>
                <MainCard>
                    <Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} />
                    {stripCells.slice(0, stripX.length).map((c, i) => (
                        <Box key={c.questionId} x={stripX[i]} y={0.65} w={1.33} h={0.59}
                            className={`flex flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${c.where === "open" ? "bg-primary text-primary-foreground ring-primary" : "bg-muted ring-border"}`}
                            style={DECK_PAD}
                        >
                            <span className="truncate px-1 text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{c.domain}</span>
                            <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{c.value}</b>
                        </Box>
                    ))}
                    <Timer remaining={remaining} />
                    <QuestionBlock question={openNow.question?.questionText ?? ""} />
                </MainCard>
                <Rail variant={phase2 ? "compact" : "answers"} cards={baseCards} onSelect={setSelectedPlayer} />
                <Strip
                    slide={phase2 ? 8 : 7}
                    items={
                        phase2
                            ? [
                                { label: "Tính giờ", content: remaining !== null ? formatRemaining(remaining) : "—", muted: true },
                                {
                                    label: "Mở chuông",
                                    onClick: mcVeDich?.openStage === "current" ? () => send({ kind: "ve-dich.closeCurrentAnswer" }) : undefined,
                                    title: mcVeDich?.openStage === "current" ? "đóng phần trả lời → mở bấm chuông 5s" : "chuông đã mở / chưa tới lượt",
                                },
                                { label: "Đúng", onClick: target ? () => setVerdict(true) : undefined, title: target ? "chấm Đúng" : "chưa có trả lời" },
                                { label: "Sai", onClick: target ? () => setVerdict(false) : undefined, title: target ? "chấm Sai" : "chưa có trả lời" },
                                { label: "Kết thúc", onClick: needsVerdict || buzzerMissing ? undefined : ketThuc, title: needsVerdict ? "chấm đáp án trước" : buzzerMissing ? "chấm người bấm chuông trước" : "chốt điểm câu này" },
                            ]
                            : [
                                { label: "Tính giờ", content: remaining !== null ? formatRemaining(remaining) : "—", muted: true },
                                { label: "Đúng", onClick: target ? () => setVerdict(true) : undefined, title: target ? "chấm Đúng" : "chưa có trả lời" },
                                { label: "Sai", onClick: target ? () => setVerdict(false) : undefined, title: target ? "chấm Sai" : "chưa có trả lời" },
                                { label: "Kết thúc", onClick: needsVerdict ? undefined : ketThuc, title: needsVerdict ? "chấm đáp án trước" : "chốt điểm câu này" },
                            ]
                    }
                />
                <Status
                    y={5.22}
                    error={flash}
                    hint={
                        mcVeDich?.openStage === "buzz"
                            ? "cửa sổ chuông 5s"
                            : phase2
                                ? "đóng phần trả lời → mở chuông"
                                : mcVeDich?.turnPlayerId
                                    ? "thí sinh đang đáp"
                                    : undefined
                    }
                />
            </>
        )
    } else {
        screen = (
            <MainCard>
                <Badges round={ROUND_LABEL[roundId] ?? roundId} />
                <Box x={0.59} y={1.4} w={8.0} className="font-sans text-muted-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                    Đang chờ dữ liệu vòng…
                </Box>
            </MainCard>
        )
    }

    return <StageShell>{screen}</StageShell>
}
