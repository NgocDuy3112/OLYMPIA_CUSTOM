import { useEffect, useState } from "react"
import { ApiError } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import { Hand, Shield, Zap } from "lucide-react"
import { cn } from "cn"
import { useLiveAnswer, useLivePlayerCommand } from "@/lib/live"
import { Countdown, type ScreenProps } from "./parts"
import { QuestionForm } from "./QuestionForm"

const POWER_LABEL: Record<"HOPE" | "SHIELD", string> = {
    HOPE: "Hy vọng",
    SHIELD: "Khiên",
}

// ve-dich, the player's side: the board (pick a cell on your turn), the open
// question (phase 1 typed for the answerer, phase 2 oral for everyone), the
// 5-second buzz window, and the public power declaration. Every refusal lands
// inline; the 409s self-correct through the refetch the command triggers.
export function VeDichScreen({ view, clock, matchId }: ScreenProps) {
    const cmd = useLivePlayerCommand(matchId)
    const answer = useLiveAnswer(matchId)

    const me = view.me
    const open = view.open[0]
    const batch = view.stage === "phase2"
    const pending = me.pendingPicks ?? []
    const verdicts = me.verdicts ?? {}
    const table = view.table

    // My picking moment: my turn, nothing open, nothing already committed.
    const picking = open === undefined && me.isMyTurn === true && pending.length === 0

    const [selected, setSelected] = useState<string[]>([])
    useEffect(() => {
        if (!picking) setSelected([])
    }, [picking])

    const toggle = (questionId: string) => {
        if (!picking) return
        setSelected((current) => {
            if (current.includes(questionId)) return current.filter((id) => id !== questionId)
            if (!batch) return [questionId]                      // phase 1: one cell
            return current.length >= 3 ? current : [...current, questionId]  // phase 2: three
        })
    }

    const confirmPicks = () => {
        if (batch) {
            if (selected.length === 3) cmd.mutate({ type: "pickBatch", questionIds: selected })
        } else if (selected.length === 1) {
            cmd.mutate({ type: "pick", questionId: selected[0] })
        }
    }

    const refusable = (error: unknown) =>
        error instanceof ApiError && error.status === 409 ? null : error instanceof Error ? error.message : null
    const cmdError = cmd.isError ? refusable(cmd.error) : null
    const answerError = answer.isError ? refusable(answer.error) : null

    const nameOf = (id: string) => table.find((row) => row.id === id)?.displayName ?? "Thí sinh"

    const prompt = picking
        ? batch
            ? "ĐẾN LƯỢT BẠN — chọn 3 câu trên bảng."
            : "ĐẾN LƯỢT BẠN — chọn một câu trên bảng."
        : open
            ? me.canAnswer
                ? null                        // the form is the prompt
                : me.isAnswerer
                    ? "Bạn trả lời miệng trước MC — không gõ."
                    : me.canBuzz
                        ? null                // the buzz button is the prompt
                        : "Câu hỏi đang mở — theo dõi thí sinh trả lời."
            : pending.length > 0
                ? "Đã chốt câu hỏi — chờ MC mở."
                : !me.isMyTurn
                    ? "Đến lượt thí sinh khác."
                    : null

    return (
        <div className="flex flex-col gap-4">
            {/* header: phase, buzz countdown, powers, score */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                        {batch ? "Phần 2 · Bốc 3 câu, miệng + chuông" : "Phần 1 · Chọn câu, gõ"}
                    </span>
                    <Countdown deadlineAt={open?.deadlineAt ?? null} clock={clock} label="còn" />
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5" aria-label="Quyền lực còn lại">
                        {(["HOPE", "SHIELD"] as const).map((power) => {
                            const has = (me.powersLeft ?? []).includes(power)
                            return (
                                <span
                                    key={power}
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                                        !has && "text-muted-foreground/60 line-through opacity-60"
                                    )}
                                >
                                    {power === "HOPE"
                                        ? <Zap className="size-3.5" aria-hidden />
                                        : <Shield className="size-3.5" aria-hidden />}
                                    {POWER_LABEL[power]}
                                </span>
                            )
                        })}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{me.score ?? 0} điểm</span>
                </div>
            </div>

            {cmdError && <p role="alert" className="text-sm text-destructive">{cmdError}</p>}
            {answerError && <p role="alert" className="text-sm text-destructive">{answerError}</p>}

            {prompt && (
                <div
                    className={cn(
                        "flex items-center gap-2 rounded-xl border p-4 text-sm font-medium",
                        picking ? "border-primary bg-primary/5" : "bg-card text-muted-foreground"
                    )}
                >
                    {picking && <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />}
                    {prompt}
                </div>
            )}

            {/* the open question */}
            {open && (
                <section className="flex flex-col gap-3">
                    {me.power && (
                        <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                            {me.power === "HOPE"
                                ? <Zap className="size-4" aria-hidden />
                                : <Shield className="size-4" aria-hidden />}
                            {POWER_LABEL[me.power]} đã công bố cho câu này — không rút lại được.
                        </p>
                    )}

                    {me.canDeclarePower && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">Công bố quyền lực:</span>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={cmd.isPending}
                                onClick={() => cmd.mutate({ type: "power", power: "HOPE" })}
                            >
                                <Zap className="size-3.5" aria-hidden /> {POWER_LABEL.HOPE}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={cmd.isPending}
                                onClick={() => cmd.mutate({ type: "power", power: "SHIELD" })}
                            >
                                <Shield className="size-3.5" aria-hidden /> {POWER_LABEL.SHIELD}
                            </Button>
                        </div>
                    )}

                    {batch ? (
                        // phase 2: everyone sees the question; the answer is ORAL —
                        // only the buzz window is typed into this screen's actions.
                        <>
                            <QuestionForm
                                question={open.question}
                                answerState={me.answerState}
                                verdict={verdicts[open.questionId]}
                                readOnly
                            />
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
                                <span>
                                    {me.isAnswerer
                                        ? "Bạn trả lời miệng trước MC."
                                        : "Thí sinh đang trả lời miệng."}
                                </span>
                                {me.buzzer && !me.isAnswerer && (
                                    <span className="text-muted-foreground">
                                        Đập chuông trước: <span className="font-medium text-foreground">{nameOf(me.buzzer)}</span>
                                    </span>
                                )}
                            </div>
                            {me.canBuzz && (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary bg-primary/5 p-4">
                                    <span className="text-sm font-semibold">Có chuông — bấm nhanh!</span>
                                    <div className="flex items-center gap-3">
                                        <Countdown deadlineAt={open.deadlineAt} clock={clock} label="còn" />
                                        <Button
                                            size="lg"
                                            className="gap-2"
                                            disabled={cmd.isPending}
                                            onClick={() => cmd.mutate({ type: "buzz", questionId: open.questionId })}
                                        >
                                            <Hand className="size-4" aria-hidden /> Bấm chuông
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : me.canAnswer ? (
                        <QuestionForm
                            key={open.questionId}
                            question={open.question}
                            answerState={me.answerState}
                            verdict={verdicts[open.questionId]}
                            onSubmit={(value) => answer.mutate({ questionId: open.questionId, value })}
                            submitting={answer.isPending}
                            error={answerError}
                        />
                    ) : (
                        <QuestionForm
                            question={open.question}
                            answerState={me.answerState}
                            verdict={verdicts[open.questionId]}
                            readOnly
                        />
                    )}
                </section>
            )}

            {/* the board */}
            {(view.board?.length ?? 0) > 0 && (
                <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Bảng câu hỏi
                        </h3>
                        {pending.length > 0 && !open && (
                            <span className="text-xs text-muted-foreground">
                                {pending.length} câu đã chốt
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {view.board!.map((cell) => {
                            const chosen = selected.includes(cell.questionId)
                            const actionable = picking && cell.where === "free"
                            return (
                                <button
                                    key={cell.questionId}
                                    type="button"
                                    disabled={!actionable}
                                    aria-pressed={chosen}
                                    onClick={() => toggle(cell.questionId)}
                                    className={cn(
                                        "flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors",
                                        cell.where === "open" && "border-primary bg-primary/10 ring-1 ring-primary",
                                        cell.where === "pending" && "border-primary/50 bg-primary/5",
                                        cell.where === "free" && "bg-background",
                                        actionable && "cursor-pointer hover:border-primary/60 hover:bg-muted/60",
                                        !actionable && "cursor-default",
                                        chosen && "border-primary bg-primary/10 ring-1 ring-primary"
                                    )}
                                >
                                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                        {cell.domain}
                                    </span>
                                    <span className="text-lg font-bold tabular-nums">{cell.value}</span>
                                </button>
                            )
                        })}
                    </div>

                    {picking && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                            <span className="text-sm text-muted-foreground">
                                {batch
                                    ? selected.length > 0
                                        ? `Đã chọn ${selected.length}/3 câu.`
                                        : "Chọn 3 câu trên bảng."
                                    : selected.length > 0
                                        ? "Đã chọn 1 câu."
                                        : "Chọn một câu trên bảng."}
                            </span>
                            <Button
                                disabled={batch ? selected.length !== 3 : selected.length !== 1 || cmd.isPending}
                                onClick={confirmPicks}
                            >
                                {cmd.isPending ? "Đang chốt…" : batch ? "Chốt 3 câu" : "Chọn câu này"}
                            </Button>
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}
