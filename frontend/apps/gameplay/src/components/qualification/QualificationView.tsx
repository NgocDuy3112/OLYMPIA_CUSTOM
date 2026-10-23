import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { ApiError } from "@shared/lib/api"
import { Button, buttonVariants } from "@shared/ui/button"
import { cn } from "cn"
import { isUnauthorized, loginLink, useMe } from "@/lib/session"
import { failureOf, useQualification, useSubmitAnswer } from "@/lib/qualification"
import { useQualificationStream } from "@/lib/qualification-socket"
import {
    answered,
    currentQuestion,
    derivePhase,
    dotsFor,
    ledgerFor,
    tally,
    type QualificationView,
} from "@/lib/qualification-state"
import { QuestionScreen, Dots, type JustAnswered } from "./QuestionScreen"

// The player's five screens, one component: GATE → QUESTION → WAITING → DONE →
// RESULTS. Data arrives push-first (mount + own-submit + socket signal — no
// interval anywhere); this component only decides WHAT to show and when the
// player moves between screens (Câu tiếp, review, a new turn arriving).
//
// Laptop-first: a centered column under the app's NavBar — no phone frame.

export function QualificationView({ matchId }: { matchId: string }) {
    const location = useLocation()
    const me = useMe()

    const signedOut = isUnauthorized(me.error) || me.data === null
    const sessionPending = me.isPending
    const mayFetch = !sessionPending && !signedOut

    const query = useQualification(matchId, mayFetch)
    const submit = useSubmitAnswer(matchId)

    // Push → refetch. The socket's ONLY client-side effect.
    const signal = useCallback(() => {
        void query.refetch()
    }, [query])
    useQualificationStream(matchId, mayFetch, signal)

    // The flow: a fresh verdict shows its banner until Câu tiếp; a new turn (or
    // closing) resets all of it — the push has already moved the world on.
    const [localVerdict, setLocalVerdict] = useState<JustAnswered | null>(null)
    const [pastVerdict, setPastVerdict] = useState(false)
    const [review, setReview] = useState(false)

    const view = query.data
    const current = view ? currentQuestion(view) : undefined
    const turnId = view?.closed ? "closed" : current?.questionId ?? "none"
    const prevTurn = useRef(turnId)
    useEffect(() => {
        if (prevTurn.current !== turnId) {
            prevTurn.current = turnId
            setLocalVerdict(null)
            setPastVerdict(false)
            setReview(false)
        }
    }, [turnId])

    const failure = failureOf(query.error)
    const phase = derivePhase(view, failure, signedOut)

    // Checking the session, or the first fetch — a skeleton, never a wrong screen.
    if (sessionPending || (query.isPending && !failure)) {
        return (
            <Shell>
                <div role="status" aria-label="Đang tải" className="h-72 animate-pulse rounded-xl bg-muted" />
            </Shell>
        )
    }

    if (phase.kind === "gate-login") {
        return (
            <Shell>
                <GateCard title="Tham gia sự kiện">
                    <p className="text-sm text-muted-foreground">
                        Đăng nhập để trả lời — bạn đã ngồi vào ghế của trận này.
                    </p>
                    <a href={loginLink(location.pathname)} className={cn(buttonVariants({ size: "lg" }), "mt-2 self-start")}>
                        Đăng nhập với Google
                    </a>
                </GateCard>
            </Shell>
        )
    }

    if (phase.kind === "gate-not-seated") {
        return (
            <Shell>
                <GateCard title="Không có mặt trong trận này">
                    <p className="text-sm text-muted-foreground">
                        Bạn không nằm trong danh sách thí sinh của sự kiện này. Liên hệ ban tổ
                        chức nếu nghĩ đây là sai sót.
                    </p>
                </GateCard>
            </Shell>
        )
    }

    if (phase.kind === "error") {
        return (
            <Shell>
                <GateCard title="Không tải được sự kiện">
                    <p role="alert" className="text-sm text-destructive">{phase.message}</p>
                    <Button className="mt-2 self-start" variant="outline" onClick={() => query.refetch()}>
                        Thử lại
                    </Button>
                </GateCard>
            </Shell>
        )
    }

    if (phase.kind === "results" && view) {
        return (
            <Shell>
                <ResultsScreen view={view} />
            </Shell>
        )
    }

    // gate-waiting — the rules screen doubles as the waiting screen; the socket
    // is subscribed behind it and the first 200 swaps this out.
    if (phase.kind === "gate-waiting" || !view || !current) {
        return (
            <Shell>
                <GateCard title="Sự kiện chưa mở">
                    <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                        <li>• Mỗi câu trả lời đúng 1 lần — không sửa được.</li>
                        <li>• Câu kế tiếp hiện ra khi ban tổ chức chuyển câu.</li>
                        <li>• Không có đồng hồ đếm — cứ bình tĩnh suy nghĩ.</li>
                    </ul>
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                        <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
                        Chờ ban tổ chức mở — trang tự cập nhật.
                    </p>
                </GateCard>
            </Shell>
        )
    }

    // ── The flow around the wizard ────────────────────────────────────────
    const fresh = localVerdict && localVerdict.questionId === current.questionId
        ? localVerdict
        : null

    const submitAnswer = (questionId: string, value: { picked?: string[]; text?: string }) => {
        submit.mutate(
            { questionId, value },
            {
                onSuccess: (result) => {
                    setLocalVerdict({ questionId, verdict: result.verdict, value })
                },
            }
        )
    }

    // A 409 (already answered / the turn moved on) is corrected by the refetch
    // the mutation triggers — no alarming red text for a race the server won.
    const submitError =
        submit.isError &&
        !(submit.error instanceof ApiError && submit.error.status === 409)
            ? submit.error.message
            : null

    const releaseWizard = (mode: "answer" | "banner" | "review") => (
        <QuestionScreen
            key={mode === "review" ? `review-${turnId}` : turnId}
            view={view}
            released={view.questions}
            initialIndex={view.questions.length - 1}
            turnKey={turnId}
            dots={dotsFor(view)}
            justAnswered={mode === "banner" && fresh ? fresh : null}
            review={mode === "review"}
            onAnswer={mode === "answer" ? submitAnswer : undefined}
            submitting={submit.isPending}
            submitError={mode === "answer" ? submitError : null}
            onAdvancePast={mode === "banner" ? () => setPastVerdict(true) : undefined}
        />
    )

    const atLast = view.currentPosition !== null && view.currentPosition >= view.totalQuestions - 1
    const anyAnswer = Boolean(answered(view, current.questionId) || fresh)

    // Precedence: explicit review › the fresh banner › waiting/done › the input.
    // A resume (answered, no local banner) lands straight on waiting/done — the
    // verdict is shown there, and Câu tiếp was already spent in the last session.
    return (
        <Shell>
            {review ? (
                <div className="flex flex-col gap-4">
                    <Button variant="ghost" className="self-start" onClick={() => setReview(false)}>
                        ◀ Quay lại
                    </Button>
                    {releaseWizard("review")}
                </div>
            ) : fresh && !pastVerdict ? (
                releaseWizard("banner")
            ) : anyAnswer ? (
                atLast ? (
                    <DoneScreen view={view} correct={tally(view).correct} onReview={() => setReview(true)} />
                ) : (
                    <WaitingScreen view={view} onReview={() => setReview(true)} />
                )
            ) : (
                releaseWizard("answer")
            )}
        </Shell>
    )
}


// ── Shell & gates ───────────────────────────────────────────────────────────

function Shell({ children }: { children: ReactNode }) {
    // Laptop-first: one centered column under the NavBar.
    return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">{children}</div>
}

function GateCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="flex flex-col rounded-xl border bg-card p-6">
            <h1 className="font-heading text-2xl font-semibold">{title}</h1>
            <div className="mt-3 flex flex-col gap-2">{children}</div>
        </div>
    )
}


// ── WAITING ─────────────────────────────────────────────────────────────────

function WaitingScreen({ view, onReview }: { view: QualificationView; onReview: () => void }) {
    const current = currentQuestion(view)!
    const answer = answered(view, current.questionId)

    return (
        <div className="flex flex-col gap-5">
            <StaticDots view={view} />
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
                <div
                    role="status"
                    className={cn(
                        "rounded-lg border px-4 py-3 font-semibold",
                        answer?.verdict === "CORRECT"
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
                    )}
                >
                    {answer?.verdict === "CORRECT" ? "✓ Đúng!" : "✗ Chưa đúng"}
                </div>
                <p className="text-sm text-muted-foreground">Đã trả lời — chờ ban tổ chức sang câu tiếp theo.</p>
                <p className="flex items-center gap-2 text-sm">
                    <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
                    Trang tự cập nhật.
                </p>
                <Button variant="outline" className="self-start" onClick={onReview}>
                    Xem lại các câu đã trả lời
                </Button>
            </div>
        </div>
    )
}


// ── DONE ────────────────────────────────────────────────────────────────────

function DoneScreen({
    view,
    correct,
    onReview,
}: {
    view: QualificationView
    correct: number
    onReview: () => void
}) {
    return (
        <div className="flex flex-col gap-5">
            <StaticDots view={view} />
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
                <span className="text-4xl" aria-hidden>🏁</span>
                <h1 className="font-heading text-2xl font-semibold">Hoàn thành!</h1>
                <p className="text-3xl font-bold tabular-nums">
                    {correct} / {view.totalQuestions}
                    <span className="ml-2 text-base font-medium text-muted-foreground">câu đúng</span>
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                    Điểm từng câu được tính theo toàn bộ người chơi — hiện ra khi ban tổ chức
                    <strong className="text-foreground"> ĐÓNG </strong>
                    sự kiện.
                </p>
                <p className="text-sm text-muted-foreground">
                    Rời khỏi trang được nhé — kết quả sẽ chờ bạn ở đây.
                </p>
                <Button variant="outline" onClick={onReview}>
                    Xem lại các câu đã trả lời
                </Button>
            </div>
        </div>
    )
}


// ── RESULTS ─────────────────────────────────────────────────────────────────

function ResultsScreen({ view }: { view: QualificationView }) {
    const { correct, points } = tally(view)
    const rows = ledgerFor(view)

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
                <div className="flex items-baseline justify-between gap-3">
                    <h1 className="font-heading text-2xl font-semibold">📊 Kết quả</h1>
                    <span className="text-sm text-muted-foreground">{view.label}</span>
                </div>
                <p className="text-xl font-semibold tabular-nums">
                    Tổng: {points > 0 ? `+${points}` : points} điểm
                    <span className="ml-3 text-base font-medium text-muted-foreground">
                        {correct}/{view.totalQuestions} câu đúng
                    </span>
                </p>

                <ul className="flex flex-col divide-y">
                    {rows.map((row) => (
                        <li key={row.position} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                            <span className="w-16 text-muted-foreground tabular-nums">
                                Câu {row.position + 1}
                            </span>
                            {row.kind === "answered" ? (
                                <>
                                    <span className="flex-1">
                                        <span
                                            className={cn(
                                                "font-medium",
                                                row.answer.verdict === "CORRECT"
                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                    : "text-red-600 dark:text-red-400"
                                            )}
                                        >
                                            {row.answer.verdict === "CORRECT" ? "✓ đúng" : "✗ sai"}
                                        </span>
                                    </span>
                                    <span className="w-14 text-right font-semibold tabular-nums">
                                        {row.answer.pointsAwarded > 0 ? "+" : ""}
                                        {row.answer.pointsAwarded}
                                    </span>
                                </>
                            ) : row.kind === "missed" ? (
                                <>
                                    <span className="flex-1 text-muted-foreground">— không trả lời</span>
                                    <span className="w-14 text-right tabular-nums text-muted-foreground">0</span>
                                </>
                            ) : (
                                <>
                                    <span className="flex-1 text-muted-foreground">— không diễn ra</span>
                                    <span className="w-14 text-right tabular-nums text-muted-foreground">—</span>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
            <p className="text-center text-xs text-muted-foreground">
                Sự kiện này không tính vào bảng xếp hạng.
            </p>
        </div>
    )
}


// ── shared ──────────────────────────────────────────────────────────────────

function StaticDots({ view }: { view: QualificationView }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <Dots dots={dotsFor(view)} activeIndex={view.currentPosition ?? view.questions.length - 1} />
            <span className="text-sm tabular-nums text-muted-foreground">
                {view.answers.length}/{view.totalQuestions} đã trả lời
            </span>
        </div>
    )
}
