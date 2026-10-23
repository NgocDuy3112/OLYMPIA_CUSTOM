import { useState, type ReactNode } from "react"
import { cn } from "cn"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { ApiError } from "@shared/lib/api"
import { useAdvanceMassEvent, useCloseMassEvent, useMassEvent, useOpenMassEvent } from "@/lib/tournament"
import { turnControls } from "@/lib/mass-event"

// The mass event's control room — a PAGE section (the dialog was promoted: running
// an event is a task with its own flow). Layout: the operational band across the
// top (status, live count, actions), then the current question and the field
// side by side — the page finally uses the width it is given.
// Language: Vietnamese (the show's language; the portal's fixed chrome stays English).

const TIER_NAMES = ["S", "A", "B", "C", "D", "E"]

const KIND_LABEL: Record<string, string> = {
    MC: "Trắc nghiệm",
    TEXT: "Tự luận",
    KEYWORD: "Từ khóa",
}

export function MassEventControl({
    tournamentId,
    matchId,
    seats,
}: {
    tournamentId: string
    matchId: string
    seats: number
}) {
    const view = useMassEvent(tournamentId, matchId)
    const close = useCloseMassEvent(tournamentId)
    const openEvent = useOpenMassEvent(tournamentId)
    const advance = useAdvanceMassEvent(tournamentId)

    const [orders, setOrders] = useState<Record<string, string[]>>({})
    const [tiedGroups, setTiedGroups] = useState<string[][]>([])

    if (view.isPending) {
        return (
            <Section>
                <div role="status" aria-label="Đang tải" className="h-24 animate-pulse rounded-lg bg-muted" />
            </Section>
        )
    }
    if (view.isError) {
        return (
            <Section>
                <p role="alert" className="text-sm text-destructive">{view.error.message}</p>
            </Section>
        )
    }

    const data = view.data
    const names = new Map(data.field.map((row) => [row.userId, row.displayName]))
    const ranked = [...data.results].sort((a, b) => a.rank - b.rank)
    const controls = turnControls({
        closed: data.closed,
        opened: data.opened,
        currentPosition: data.currentPosition,
        questionCount: data.questionCount,
        currentAnswered: data.currentAnswered,
        fieldSize: data.field.length,
    })
    const actionError = openEvent.isError
        ? openEvent.error.message
        : advance.isError
            ? advance.error.message
            : null
    const releasedLabel = data.releasedAt
        ? new Date(data.releasedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : null
    // The open turn, narrowed: everything the band reads lives here, so the
    // discriminated union stays checked (closed/not-open never reach the band —
    // they returned above or take the other branch).
    const turn = controls.phase === "open" ? controls : null
    const answeredPct = turn && turn.fieldSize > 0
        ? Math.round((turn.currentAnswered / turn.fieldSize) * 100)
        : 0

    const submit = () => {
        const tieBreaks = tiedGroups.map((group) => ({
            players: group,
            order: orders[group.join("|")] ?? group,
        }))
        close.mutate(
            { matchId, tieBreaks: tieBreaks.length > 0 ? tieBreaks : undefined },
            {
                onSuccess: () => setTiedGroups([]),
                onError: (error) => {
                    const details = error instanceof ApiError ? error.details ?? [] : []
                    setTiedGroups(details.map((group) => group.split(",").map((id) => id.trim())))
                },
            }
        )
    }

    const move = (group: string[], index: number, by: number) => {
        const key = group.join("|")
        const current = orders[key] ?? group
        const next = [...current]
        const target = index + by
        if (target < 0 || target >= next.length) return
        const [row] = next.splice(index, 1)
        next.splice(target, 0, row)
        setOrders((state) => ({ ...state, [key]: next }))
    }

    // ── closed: the ranking ──────────────────────────────────────────────
    if (data.closed) {
        return (
            <div className="flex flex-col gap-6">
                <Section>
                    <div className="mb-4 flex items-center gap-2">
                        <Badge variant="secondary">Đã đóng</Badge>
                        <p className="text-sm text-muted-foreground">
                            Bảng xếp hạng không tính điểm — chỉ ghi lại thứ tự của cả field.
                        </p>
                    </div>
                    <p className="mb-3 text-sm text-muted-foreground">
                        Thang tier là các nhóm {seats} người; mỗi trận splitting lấy 1 người
                        từ mỗi tier.
                    </p>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16">Hạng</TableHead>
                                <TableHead>Tier</TableHead>
                                <TableHead>Thí sinh</TableHead>
                                <TableHead className="text-right">Điểm</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ranked.map((entry, index) => (
                                <TableRow key={entry.userId ?? index}>
                                    <TableCell className="tabular-nums">{entry.rank}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">
                                            {TIER_NAMES[Math.floor(index / seats)] ?? "—"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{entry.userId ? names.get(entry.userId) ?? entry.userId : "—"}</TableCell>
                                    <TableCell className="text-right tabular-nums">{entry.totalScore}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Section>

                {tiedGroups.length > 0 && (
                    <TieSection
                        groups={tiedGroups}
                        orders={orders}
                        names={names}
                        move={move}
                        closePending={close.isPending}
                        closeError={close.isError ? close.error.message : null}
                        onSubmit={submit}
                    />
                )}
            </div>
        )
    }

    // ── open / not open ──────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-6">
            {/* the operational band, full width */}
            <Section>
                {!turn ? (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                            <p className="flex items-center gap-2 text-lg font-semibold">
                                <Badge variant="outline">Chưa mở</Badge>
                                {data.questionCount} câu hỏi · {data.field.length} thí sinh
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Mở trận sẽ phát câu 1 cho toàn bộ thí sinh — đồng hồ của mọi
                                người tính từ giây phút đó.
                            </p>
                        </div>
                        <Button size="lg" onClick={() => openEvent.mutate(matchId)} disabled={openEvent.isPending}>
                            {openEvent.isPending ? "Đang mở…" : "Mở trận ▶"}
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
                                    Đang mở
                                </p>
                                <p className="font-heading text-3xl font-semibold tabular-nums">
                                    CÂU {turn.questionNumber}
                                    <span className="text-xl text-muted-foreground"> / {turn.questionCount}</span>
                                    {releasedLabel && (
                                        <span className="ml-3 text-sm font-normal text-muted-foreground">
                                            phát lúc {releasedLabel}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <p className="text-xl font-semibold tabular-nums">
                                {turn.currentAnswered} / {turn.fieldSize}
                                <span className="ml-2 text-sm font-medium text-muted-foreground">đã trả lời</span>
                            </p>
                        </div>

                        <div
                            className="h-3 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={turn.fieldSize}
                            aria-valuenow={turn.currentAnswered}
                        >
                            <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${answeredPct}%` }}
                            />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => advance.mutate(matchId)}
                                    disabled={!turn.canAdvance || advance.isPending}
                                >
                                    {advance.isPending
                                        ? "Đang chuyển…"
                                        : turn.canAdvance
                                            ? "Sang câu tiếp →"
                                            : "Câu tiếp →"}
                                </Button>
                                <Button variant="outline" onClick={submit} disabled={close.isPending}>
                                    {close.isPending ? "Đang đóng…" : "Đóng sự kiện"}
                                </Button>
                            </div>
                            {!turn.canAdvance && (
                                <p className="text-xs text-muted-foreground">{turn.advanceReason}</p>
                            )}
                        </div>
                    </div>
                )}

                {actionError && <p role="alert" className="mt-3 text-sm text-destructive">{actionError}</p>}
                {close.isError && tiedGroups.length === 0 && (
                    <p role="alert" className="mt-3 text-sm text-destructive">{close.error.message}</p>
                )}
            </Section>

            {/* question | field — the width, finally used */}
            <div className={cn("grid gap-6", data.currentQuestion && "lg:grid-cols-5")}>
                {data.currentQuestion && (
                    <Section className="lg:col-span-3">
                        <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <span>Câu hiện tại · {KIND_LABEL[data.currentQuestion.kind] ?? data.currentQuestion.kind}</span>
                            <span className="font-normal normal-case tracking-normal">
                                Thí sinh chỉ thấy câu này khi nó là câu hiện tại
                            </span>
                        </p>
                        <p className="text-lg font-medium">{data.currentQuestion.questionText}</p>
                        {data.currentQuestion.media && (
                            <p className="mt-1 break-all text-xs text-muted-foreground">
                                media: {data.currentQuestion.media.type} — {data.currentQuestion.media.url}
                            </p>
                        )}
                        {data.currentQuestion.payload.options ? (
                            <ul className="mt-2 flex flex-col gap-1 text-sm">
                                {data.currentQuestion.payload.options.map((option, index) => (
                                    <li key={option.id} className="flex gap-2">
                                        <span className="font-medium text-muted-foreground">
                                            {String.fromCharCode(65 + index)}.
                                        </span>
                                        <span>{option.text}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-1 text-sm text-muted-foreground">
                                Trả lời tự do — thí sinh nhập text.
                            </p>
                        )}
                    </Section>
                )}

                <Section className={cn(data.currentQuestion ? "lg:col-span-2" : "")}>
                    <h2 className="mb-3 text-lg font-semibold">Thí sinh</h2>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Thí sinh</TableHead>
                                <TableHead className="text-right">Trả lời</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.field.map((row) => (
                                <TableRow key={row.userId}>
                                    <TableCell className="min-w-0">
                                        <span className="block truncate">{row.displayName}</span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.answered} / {data.questionCount}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Section>
            </div>

            {tiedGroups.length > 0 && (
                <TieSection
                    groups={tiedGroups}
                    orders={orders}
                    names={names}
                    move={move}
                    closePending={close.isPending}
                    closeError={close.isError ? close.error.message : null}
                    onSubmit={submit}
                />
            )}
        </div>
    )
}


function Section({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <section className={cn("rounded-xl border bg-card p-5", className)}>
            {children}
        </section>
    )
}

// The tied group ordering — the close refuses until the staff give an order.
function TieSection({
    groups,
    orders,
    names,
    move,
    closePending,
    closeError,
    onSubmit,
}: {
    groups: string[][]
    orders: Record<string, string[]>
    names: Map<string, string>
    move: (group: string[], index: number, by: number) => void
    closePending: boolean
    closeError: string | null
    onSubmit: () => void
}) {
    return (
        <section className="rounded-xl border border-amber-500/40 bg-card p-5">
            <p className="mb-3 text-sm font-medium">
                Các thí sinh bị hòa: hãy sắp thứ tự — tie-break chỉ dùng để xếp hạng,
                không thay đổi điểm.
            </p>
            <div className="flex flex-col gap-4">
                {groups.map((group) => {
                    const key = group.join("|")
                    const order = orders[key] ?? group
                    return (
                        <div key={key} className="flex flex-col gap-1">
                            {order.map((userId, index) => (
                                <div key={userId} className="flex items-center gap-2 text-sm">
                                    <span className="w-6 tabular-nums text-muted-foreground">{index + 1}</span>
                                    <span>{names.get(userId) ?? userId}</span>
                                    <span className="ml-auto flex gap-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            aria-label="Chuyển lên"
                                            disabled={index === 0}
                                            onClick={() => move(group, index, -1)}
                                        >
                                            ↑
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            aria-label="Chuyển xuống"
                                            disabled={index === order.length - 1}
                                            onClick={() => move(group, index, 1)}
                                        >
                                            ↓
                                        </Button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )
                })}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
                {closeError && <p role="alert" className="text-sm text-destructive">{closeError}</p>}
                <Button onClick={onSubmit} disabled={closePending}>
                    {closePending ? "Đang đóng…" : "Đóng với thứ tự này"}
                </Button>
            </div>
        </section>
    )
}
