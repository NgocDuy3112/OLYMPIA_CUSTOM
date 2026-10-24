import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { cn } from "cn"
import { formatRemaining, isUrgent, useCountdown, useServerClock } from "@shared/lib/clock"
import {
    hintPool,
    mergedVerdicts,
    startActionPayload,
    useLive,
    useLiveAction,
    useQuestionAnswers,
    type ConsoleQuestion,
    type GiaiMaMc,
    type Projection,
    type QuestionAnswerRow,
    type VeDichMc,
} from "@/lib/live"
import { useEnrolled, useMatches, useTournament } from "@/lib/tournament"

// The MC's console — a section of the match page while the match is LIVE.
// One polled read (3 s); every action carries the version it was read from;
// every refusal (409 CONFLICT / engine rule) is shown next to its button:
// reject, reload, explain (docs/ui-patterns.md). Vietnamese: match page = show.
//
// The engine is the referee: buttons appear when the state suggests they could
// work, and the server's refusal message is what explains the rest — the console
// never duplicates engine rules to pre-disable half its controls.

const STAGE_LABEL: Record<string, string> = {
    pending: "Chờ bắt đầu",
    phase1: "Giai đoạn 1",
    phase2: "Giai đoạn 2",
    hints: "Đoán hint",
    question: "Đang trả lời",
    ended: "Đã kết thúc",
}

interface WatchState {
    running: boolean
    startedAt: number
    base: number
}

const watchMs = (watch: WatchState): number =>
    watch.base + (watch.running ? Date.now() - watch.startedAt : 0)

export function LiveConsole({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
    // ── every hook first — early returns must not move the hook line ─────────
    const live = useLive(tournamentId, matchId)
    const matches = useMatches(tournamentId)
    const enrolled = useEnrolled(tournamentId)
    const tournament = useTournament(tournamentId)
    const writer = useLiveAction(tournamentId, matchId)
    const clock = useServerClock()

    const [overrides, setOverrides] = useState<Record<string, boolean>>({})
    const [selectedQ, setSelectedQ] = useState<string | null>(null)
    const [watch, setWatch] = useState<WatchState>({ running: false, startedAt: 0, base: 0 })
    const [, forceTick] = useState(0)

    // A new oral question resets the stopwatch.
    const oralQuestionId = live.data?.projection.oral?.questionId ?? null
    useEffect(() => {
        setWatch({ running: false, startedAt: 0, base: 0 })
    }, [oralQuestionId])

    useEffect(() => {
        if (!watch.running) return
        const id = setInterval(() => forceTick((n) => n + 1), 250)
        return () => clearInterval(id)
    }, [watch.running])

    const names = useMemo(
        () => new Map((enrolled.data?.items ?? []).map((row) => [row.userId, row.displayName])),
        [enrolled.data]
    )

    const projection = live.data?.projection
    const roundId = live.data?.roundId ?? ""
    const open = projection?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, clock)

    // Whichever panel is on screen reads the drafts ledger for ITS question —
    // one hook, one derived id (no hooks in loops).
    const judgingId =
        live.data && (roundId === "khoi-dong" || roundId === "but-pha")
            ? (open.some((q) => q.questionId === selectedQ)
                ? selectedQ
                : open[0]?.questionId ?? null)
            : null
    const resolvingId =
        live.data && roundId === "ve-dich" && open.length > 0 ? open[0].questionId : null
    const answers = useQuestionAnswers(tournamentId, matchId, judgingId ?? resolvingId)
    const rows = answers.data ?? []

    // ── early returns (hooks above never move) ────────────────────────────────
    if (live.isPending) {
        return (
            <Section>
                <div role="status" aria-label="Đang tải vòng thi" className="h-24 animate-pulse rounded-lg bg-muted" />
            </Section>
        )
    }
    if (live.isError) {
        return (
            <Section>
                <p role="alert" className="text-sm text-destructive">{live.error.message}</p>
            </Section>
        )
    }

    // ── values ────────────────────────────────────────────────────────────────
    const v = live.data
    const stage = v.projection.stage
    const roundName = tournament.data?.rounds.find((r) => r.id === v.roundId)?.name ?? v.roundId
    const started = stage !== "pending"
    const userSeats = (matches.data?.items.find((m) => m.id === matchId)?.players ?? [])
        .flatMap((seat) => ("userId" in seat && seat.userId ? [seat.userId] : []))

    const send = (act: Record<string, unknown>) =>
        writer.mutate({ expectedVersion: v.version, action: act })

    const toggleWatch = () =>
        setWatch((w) =>
            w.running
                ? { running: false, startedAt: 0, base: w.base + (Date.now() - w.startedAt) }
                : { running: true, startedAt: Date.now(), base: w.base }
        )

    return (
        <Section>
            {/* ── header: where we are + the two boundary actions ─────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{roundName}</Badge>
                    <span className="font-medium">{STAGE_LABEL[stage] ?? stage}</span>
                    <span className="tabular-nums text-muted-foreground">v{v.version}</span>
                </div>
                <div className="flex gap-2">
                    {started && !v.roundEnded && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={writer.isPending}
                            onClick={() => send({ kind: `${v.roundId}.endRound` })}
                        >
                            Kết thúc vòng
                        </Button>
                    )}
                    {v.roundEnded && (
                        <Button size="sm" disabled={writer.isPending} onClick={() => send({ kind: "round.advance" })}>
                            Sang vòng tiếp ▶
                        </Button>
                    )}
                </div>
            </div>

            {writer.isError && (
                <p role="alert" className="mt-3 text-sm text-destructive">{writer.error.message}</p>
            )}

            {/* ── scoreboard — the same table the players see (G4) ────────── */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {v.projection.table.map((row) => (
                    <span key={row.id} className="tabular-nums">
                        <span className="text-muted-foreground">{row.rank}.</span>{" "}
                        {row.displayName} <strong>{row.points}</strong>
                    </span>
                ))}
            </div>

            {/* ── the gate ─────────────────────────────────────────────────── */}
            {!started && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                        Vòng chưa bắt đầu — mọi hành động đều bị máy chủ từ chối cho tới khi mở.
                    </p>
                    <Button
                        disabled={writer.isPending || matches.isPending}
                        onClick={() =>
                            send({
                                kind: `${v.roundId}.start`,
                                ...startActionPayload(v.roundId, userSeats, v.questions)
                            })
                        }
                    >
                        {writer.isPending ? "Đang bắt đầu…" : "Bắt đầu vòng ▶"}
                    </Button>
                </div>
            )}

            {/* ── khoi-dong ────────────────────────────────────────────────── */}
            {started && v.roundId === "khoi-dong" && stage === "phase1" && (
                <OralRecorder
                    oral={v.projection.oral ?? null}
                    names={names}
                    watch={watch}
                    onToggleWatch={toggleWatch}
                    disabled={writer.isPending}
                    onVerdict={(correct) =>
                        send({
                            kind: "khoi-dong.recordOral",
                            correct,
                            spentS: Math.max(0, Math.floor(watchMs(watch) / 1000))
                        })
                    }
                    onTimeout={() => send({ kind: "khoi-dong.timeOutRun" })}
                    onBeginPhase2={() => send({ kind: "khoi-dong.beginPhase2" })}
                />
            )}

            {started && v.roundId === "khoi-dong" && stage === "phase2" && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <p className="text-sm tabular-nums">
                        Cả bảng trả lời trong{" "}
                        {v.projection.open.length > 0 ? (
                            <strong className={cn(isUrgent(remaining) && "text-destructive")}>
                                {formatRemaining(remaining)}
                            </strong>
                        ) : (
                            <span className="text-muted-foreground">đã đóng</span>
                        )}
                    </p>
                    {v.projection.open.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={writer.isPending}
                            onClick={() => send({ kind: "khoi-dong.closePhase2" })}
                        >
                            Đóng phase 2
                        </Button>
                    )}
                </div>
            )}

            {/* ── giai-ma ──────────────────────────────────────────────────── */}
            {started && v.roundId === "giai-ma" && (
                <GiaiMaTool
                    mc={v.mc as GiaiMaMc | null}
                    open={v.projection.open}
                    questions={v.questions}
                    remaining={remaining}
                    disabled={writer.isPending}
                    onOpenHint={(hintId) => send({ kind: "giai-ma.openHint", hintId })}
                    onCloseWindow={() => send({ kind: "giai-ma.closeHintWindow" })}
                    onResolve={() => send({ kind: "giai-ma.resolveHint" })}
                />
            )}

            {/* ── ve-dich ──────────────────────────────────────────────────── */}
            {started && v.roundId === "ve-dich" && (
                <VeDichTool
                    mc={v.mc as VeDichMc | null}
                    open={v.projection.open}
                    rows={rows}
                    names={names}
                    remaining={remaining}
                    overrides={overrides}
                    setOverrides={setOverrides}
                    disabled={writer.isPending}
                    onOpenPicked={() => {
                        const pending = (v.mc as VeDichMc | null)?.pendingQuestionId
                        if (pending) send({ kind: "ve-dich.openQuestion", questionId: pending })
                    }}
                    onCloseAnswer={() => send({ kind: "ve-dich.closeCurrentAnswer" })}
                    onResolve={() => {
                        const m = v.mc as VeDichMc | null
                        const questionId = v.projection.open[0]?.questionId
                        if (!m || !questionId) return
                        const verdicts = mergedVerdicts(questionId, rows, overrides)
                        const by = new Map(verdicts.map((d) => [d.playerId, d.correct]))
                        send({
                            kind: "ve-dich.resolve",
                            answerer: by.get(m.answererId ?? "") ?? false,
                            ...(m.buzzerId ? { buzzer: by.get(m.buzzerId) ?? false } : {})
                        })
                    }}
                    onAdvanceTurn={() => send({ kind: "ve-dich.advanceTurn" })}
                    onBeginPhase2={() => send({ kind: "ve-dich.beginPhase2" })}
                />
            )}

            {/* ── judging (khoi-dong batch / but-pha) ─────────────────────── */}
            {started && (v.roundId === "but-pha" || v.roundId === "khoi-dong") && (
                <JudgingPanel
                    roundId={v.roundId}
                    open={v.projection.open}
                    selectedId={judgingId}
                    onSelect={setSelectedQ}
                    question={v.questions.find((q) => q._id === judgingId) ?? null}
                    rows={rows}
                    names={names}
                    overrides={overrides}
                    setOverrides={setOverrides}
                    disabled={writer.isPending}
                    onConfirm={() => {
                        if (!judgingId) return
                        send({
                            kind: `${v.roundId}.finalize`,
                            questionId: judgingId,
                            verdicts: mergedVerdicts(judgingId, rows, overrides)
                        })
                    }}
                    onCloseQuestion={() => send({ kind: "but-pha.closeQuestion" })}
                />
            )}

            {started && v.roundId === "but-pha" && v.projection.open.length === 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <p className="text-sm text-muted-foreground">
                        Mỗi câu trả lời trong 30 giây — mở để bắt đầu.
                    </p>
                    <Button size="sm" disabled={writer.isPending} onClick={() => send({ kind: "but-pha.openQuestion" })}>
                        Mở câu hỏi ▶
                    </Button>
                </div>
            )}
        </Section>
    )
}

// ── shared pieces ────────────────────────────────────────────────────────────

function Section({ children, className }: { children: ReactNode; className?: string }) {
    return <section className={cn("rounded-xl border bg-card p-5", className)}>{children}</section>
}

// What a player submitted, in words: MC options as letters, text as text.
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

// One player's verdict, defaulting to the engine's draft — the MC's overwrite.
function VerdictToggle({
    questionId,
    userId,
    rows,
    overrides,
    setOverrides,
    disabled,
}: {
    questionId: string
    userId: string
    rows: QuestionAnswerRow[]
    overrides: Record<string, boolean>
    setOverrides: (updater: (current: Record<string, boolean>) => Record<string, boolean>) => void
    disabled: boolean
}) {
    const key = `${questionId}:${userId}`
    const current = overrides[key] ?? rows.find((r) => r.userId === userId)?.verdict === "CORRECT"
    const set = (correct: boolean) => setOverrides((state) => ({ ...state, [key]: correct }))

    return (
        <span className="flex gap-1">
            <button
                type="button"
                aria-label="Đúng"
                aria-pressed={current}
                disabled={disabled}
                onClick={() => set(true)}
                className={cn(
                    "rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors",
                    current
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                        : "text-muted-foreground hover:bg-muted"
                )}
            >
                ✓
            </button>
            <button
                type="button"
                aria-label="Sai"
                aria-pressed={!current}
                disabled={disabled}
                onClick={() => set(false)}
                className={cn(
                    "rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors",
                    !current
                        ? "border-red-500 bg-red-500/10 text-red-600"
                        : "text-muted-foreground hover:bg-muted"
                )}
            >
                ✗
            </button>
        </span>
    )
}

// ── khoi-dong phase 1: the oral recorder ─────────────────────────────────────
// The engine has NO wall clock here: elapsedS grows only when the MC records.
// The bar shows a consumed budget — never a ticking countdown — and the
// stopwatch is the MC's own measurement (an assertion, like the verdict).

function OralRecorder({
    oral,
    names,
    watch,
    onToggleWatch,
    disabled,
    onVerdict,
    onTimeout,
    onBeginPhase2,
}: {
    oral: Projection["oral"]
    names: Map<string, string>
    watch: WatchState
    onToggleWatch: () => void
    disabled: boolean
    onVerdict: (correct: boolean) => void
    onTimeout: () => void
    onBeginPhase2: () => void
}) {
    if (!oral) {
        return (
            <p className="mt-4 text-sm text-muted-foreground">
                Không có lượt đang mở — đang chuyển người chơi…
            </p>
        )
    }

    const spent = watchMs(watch)
    const budgetLeftMs = Math.max(0, (oral.budgetS - oral.elapsedS) * 1000)
    const overBudget = spent > budgetLeftMs
    const consumedPct = Math.min(100, Math.round((oral.elapsedS / Math.max(1, oral.budgetS)) * 100))

    return (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                    <span className="font-semibold">{names.get(oral.playerId) ?? oral.playerId}</span>
                    <span className="text-muted-foreground"> đang trả lời — </span>
                    <span className="tabular-nums">câu {oral.index + 1}/{oral.total}</span>
                </p>
                <p className="tabular-nums text-muted-foreground">
                    ngân sách còn{" "}
                    <strong className={cn(overBudget && "text-destructive")}>
                        {Math.ceil(budgetLeftMs / 1000)}s
                    </strong>
                </p>
            </div>

            {oral.question && (
                <p className="rounded-md bg-muted/50 p-3 text-base font-medium">
                    {oral.question.questionText}
                </p>
            )}

            <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={oral.budgetS}
                aria-valuenow={oral.elapsedS}
            >
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${consumedPct}%` }} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={onToggleWatch}>
                    {watch.running ? "⏸ Dừng bấm giờ" : "▶ Bấm giờ"}
                </Button>
                <span className="tabular-nums text-sm">{formatRemaining(spent)}</span>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <Button size="sm" disabled={disabled || overBudget} onClick={() => onVerdict(true)}>
                    ✓ Đúng
                </Button>
                <Button size="sm" variant="outline" disabled={disabled || overBudget} onClick={() => onVerdict(false)}>
                    ✗ Sai
                </Button>
                {overBudget && (
                    <span className="text-xs text-destructive">
                        Vượt ngân sách — câu này sẽ không được tính. Dùng “Hết giờ run”.
                    </span>
                )}
                <Button variant="ghost" size="sm" disabled={disabled} onClick={onTimeout}>
                    Hết giờ run
                </Button>
                <span className="ml-auto" />
                <Button variant="secondary" size="sm" disabled={disabled} onClick={onBeginPhase2}>
                    Sang phase 2 →
                </Button>
            </div>
        </div>
    )
}

// ── giai-ma: the hint picker and the window ──────────────────────────────────

function GiaiMaTool({
    mc,
    open,
    questions,
    remaining,
    disabled,
    onOpenHint,
    onCloseWindow,
    onResolve,
}: {
    mc: GiaiMaMc | null
    open: Projection["open"]
    questions: ConsoleQuestion[]
    remaining: number
    disabled: boolean
    onOpenHint: (hintId: string) => void
    onCloseWindow: () => void
    onResolve: () => void
}) {
    const windowOpen = open.length > 0
    const pool = hintPool(mc, questions)
    const locked = mc?.players.filter((p) => p.keywordLocked).length ?? 0
    const eliminated = mc?.players.filter((p) => p.eliminated).length ?? 0

    if (windowOpen) {
        return (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Cửa sổ hint đang mở — cả sân trả lời</p>
                    <p className="text-sm tabular-nums">
                        còn{" "}
                        <strong className={cn(isUrgent(remaining) && "text-destructive")}>
                            {formatRemaining(remaining)}
                        </strong>
                    </p>
                </div>
                {open[0].question && (
                    <p className="text-base font-medium">{open[0].question.questionText}</p>
                )}
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={disabled} onClick={onResolve}>
                        Chốt hint (tính từ ledger)
                    </Button>
                    <Button variant="outline" size="sm" disabled={disabled} onClick={onCloseWindow}>
                        Đóng cửa sổ
                    </Button>
                    <span className="self-center text-xs text-muted-foreground">
                        Đúng → hint chỉ lộ cho người trả lời đúng; chốt xong hint bị tiêu.
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div className="mt-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Chọn hint để mở — thứ tự do MC tự chọn</p>
                <p className="text-xs text-muted-foreground">
                    Đã khóa từ khóa: {locked} · bị loại: {eliminated}
                </p>
            </div>
            {pool.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Hết hint — mọi người nộp từ khóa xong thì Kết thúc vòng.
                </p>
            ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                    {pool.map((hint, index) => (
                        <li
                            key={hint.questionId}
                            className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                        >
                            <span>
                                <span className="mr-1 font-medium text-muted-foreground">H{index + 1}.</span>
                                {hint.text}
                            </span>
                            <Button size="sm" variant="outline" disabled={disabled} onClick={() => onOpenHint(hint.questionId)}>
                                Mở
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

// ── ve-dich: turns, the picked question, the buzz resolve ────────────────────

function VeDichTool({
    mc,
    open,
    rows,
    names,
    remaining,
    overrides,
    setOverrides,
    disabled,
    onOpenPicked,
    onCloseAnswer,
    onResolve,
    onAdvanceTurn,
    onBeginPhase2,
}: {
    mc: VeDichMc | null
    open: Projection["open"]
    rows: QuestionAnswerRow[]
    names: Map<string, string>
    remaining: number
    overrides: Record<string, boolean>
    setOverrides: (updater: (current: Record<string, boolean>) => Record<string, boolean>) => void
    disabled: boolean
    onOpenPicked: () => void
    onCloseAnswer: () => void
    onResolve: () => void
    onAdvanceTurn: () => void
    onBeginPhase2: () => void
}) {
    const openNow = open[0] ?? null
    const roleOf = (userId: string) =>
        userId === mc?.answererId ? "Trả lời" : userId === mc?.buzzerId ? "Bấm chuông" : ""

    return (
        <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                    Giai đoạn {mc?.phase ?? "—"} ·{" "}
                    {mc?.turnPlayerId ? (
                        <>
                            lượt của <span className="font-semibold">{names.get(mc.turnPlayerId) ?? mc.turnPlayerId}</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">chờ lượt</span>
                    )}
                    {mc?.power && (
                        <Badge className="ml-2" variant={mc.power === "HOPE" ? "default" : "secondary"}>
                            {mc.power} đã công bố
                        </Badge>
                    )}
                </p>
                {!openNow && !mc?.pendingQuestionId && mc && (
                    <div className="flex gap-2">
                        {mc.phase === 1 && (
                            <Button variant="outline" size="sm" disabled={disabled} onClick={onBeginPhase2}>
                                Sang giai đoạn 2
                            </Button>
                        )}
                        <Button variant="outline" size="sm" disabled={disabled} onClick={onAdvanceTurn}>
                            Lượt tiếp theo →
                        </Button>
                    </div>
                )}
            </div>

            {!openNow && mc?.pendingQuestionId && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <p className="text-sm text-muted-foreground">
                        Thí sinh đã chọn — câu sẵn sàng mở.
                    </p>
                    <Button size="sm" disabled={disabled} onClick={onOpenPicked}>
                        Mở câu đã chọn ▶
                    </Button>
                </div>
            )}

            {openNow && (
                <div className="flex flex-col gap-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                            {mc?.openStage === "buzz" ? "Cửa sổ bấm chuông" : "Thí sinh đang trả lời"}
                        </p>
                        {openNow.deadlineAt && (
                            <p className="text-sm tabular-nums">
                                còn{" "}
                                <strong className={cn(isUrgent(remaining) && "text-destructive")}>
                                    {formatRemaining(remaining)}
                                </strong>
                            </p>
                        )}
                    </div>
                    {openNow.question && (
                        <p className="text-base font-medium">{openNow.question.questionText}</p>
                    )}

                    {mc?.openStage === "current" && (
                        <div className="flex justify-end">
                            <Button size="sm" disabled={disabled} onClick={onCloseAnswer}>
                                Đóng phần trả lời → mở bấm chuông
                            </Button>
                        </div>
                    )}

                    {mc?.openStage === "buzz" && (
                        <div className="flex flex-col gap-2 border-t pt-3">
                            {rows.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Chưa ghi lại lời nào.</p>
                            ) : (
                                rows.map((row) => (
                                    <div key={row.userId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                        <span>
                                            <Badge
                                                variant={row.userId === mc.answererId ? "default" : "secondary"}
                                                className="mr-2"
                                            >
                                                {roleOf(row.userId)}
                                            </Badge>
                                            {names.get(row.userId) ?? row.userId}
                                            <span className="ml-2 text-muted-foreground">{valueText(row)}</span>
                                        </span>
                                        <VerdictToggle
                                            questionId={openNow.questionId}
                                            userId={row.userId}
                                            rows={rows}
                                            overrides={overrides}
                                            setOverrides={setOverrides}
                                            disabled={disabled}
                                        />
                                    </div>
                                ))
                            )}
                            <div className="flex justify-end">
                                <Button size="sm" disabled={disabled || rows.length === 0} onClick={onResolve}>
                                    Chốt kết quả
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── judging: khoi-dong phase 2 batch / but-pha, over the drafts ledger ───────

function JudgingPanel({
    roundId,
    open,
    selectedId,
    onSelect,
    question,
    rows,
    names,
    overrides,
    setOverrides,
    disabled,
    onConfirm,
    onCloseQuestion,
}: {
    roundId: string
    open: Projection["open"]
    selectedId: string | null
    onSelect: (questionId: string) => void
    question: ConsoleQuestion | null
    rows: QuestionAnswerRow[]
    names: Map<string, string>
    overrides: Record<string, boolean>
    setOverrides: (updater: (current: Record<string, boolean>) => Record<string, boolean>) => void
    disabled: boolean
    onConfirm: () => void
    onCloseQuestion: () => void
}) {
    if (open.length === 0) return null

    return (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Chốt điểm câu hỏi</p>
                {open.length > 1 && (
                    <div className="flex flex-wrap gap-1">
                        {open.map((entry) => (
                            <Button
                                key={entry.questionId}
                                size="sm"
                                variant={entry.questionId === selectedId ? "default" : "outline"}
                                onClick={() => onSelect(entry.questionId)}
                            >
                                Câu {(entry.question?.position ?? 0) + 1}
                            </Button>
                        ))}
                    </div>
                )}
            </div>

            {question ? (
                <>
                    <p className="text-base font-medium">{question.questionText}</p>
                    {question.payload.options && (
                        <ul className="flex flex-wrap gap-2 text-sm">
                            {question.payload.options.map((option, index) => (
                                <li key={option.id} className="rounded-md border px-2 py-1">
                                    <span className="mr-1 font-medium text-muted-foreground">
                                        {String.fromCharCode(65 + index)}.
                                    </span>
                                    {option.text}
                                </li>
                            ))}
                        </ul>
                    )}

                    {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Chưa ai trả lời câu này.</p>
                    ) : (
                        rows.map((row) => (
                            <div key={row.userId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span>
                                    <span className="font-medium">{names.get(row.userId) ?? row.userId}</span>
                                    <span className="ml-2 text-muted-foreground">{valueText(row, question)}</span>
                                    <Badge variant={row.judged ? "secondary" : "outline"} className="ml-2">
                                        {row.judged ? "đã chốt" : "nháp"}
                                    </Badge>
                                </span>
                                <VerdictToggle
                                    questionId={question._id}
                                    userId={row.userId}
                                    rows={rows}
                                    overrides={overrides}
                                    setOverrides={setOverrides}
                                    disabled={disabled}
                                />
                            </div>
                        ))
                    )}

                    <div className="flex justify-end gap-2">
                        {roundId === "but-pha" && (
                            <Button variant="outline" size="sm" disabled={disabled} onClick={onCloseQuestion}>
                                Đóng câu
                            </Button>
                        )}
                        <Button size="sm" disabled={disabled || rows.length === 0} onClick={onConfirm}>
                            Chốt điểm &amp; tính điểm
                        </Button>
                    </div>
                </>
            ) : (
                <p className="text-sm text-muted-foreground">Chưa có câu nào đang mở.</p>
            )}
        </div>
    )
}
