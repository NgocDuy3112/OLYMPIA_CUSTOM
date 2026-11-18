import { useMemo, useState } from "react"
import { ROUND_LABEL } from "@shared/deck/geometry"

export function RegradeDialog({ playerName, rows, onCancel, onSubmit }: {
    playerName: string
    rows: Array<{ questionId: string; text: string; points: number | null; roundId: string }>
    onCancel: () => void
    onSubmit: (questionId: string, delta: number) => void
}) {
    const [questionId, setQuestionId] = useState<string | null>(null)
    const [delta, setDelta] = useState("")
    const [activeRound, setActiveRound] = useState<string | null>(null)
    const [search, setSearch] = useState("")

    const roundIds = useMemo(() => {
        const seen = new Set<string>()
        const order: string[] = []
        for (const roundId of Object.keys(ROUND_LABEL)) {
            if (rows.some((r) => r.roundId === roundId)) {
                seen.add(roundId)
                order.push(roundId)
            }
        }
        for (const row of rows) {
            if (!seen.has(row.roundId)) {
                seen.add(row.roundId)
                order.push(row.roundId)
            }
        }
        return order
    }, [rows])

    const currentRound = activeRound ?? roundIds[0] ?? null
    const needle = search.trim().toLowerCase()
    const visible = rows.filter(
        (row) =>
            row.roundId === currentRound &&
            (needle === "" || row.text.toLowerCase().includes(needle)),
    )

    const parsed = Number.parseInt(delta, 10)
    const valid = questionId !== null && Number.isInteger(parsed) && parsed !== 0

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onCancel}>
            <form
                role="dialog"
                aria-label={`Sửa điểm câu trả lời của ${playerName}`}
                className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border bg-card p-5 shadow-lg"
                onClick={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                    event.preventDefault()
                    if (valid && questionId !== null) onSubmit(questionId, parsed)
                }}
            >
                <h2 className="font-display text-lg font-bold uppercase">Sửa điểm câu trả lời</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Thí sinh: <span className="font-medium text-foreground">{playerName}</span> — chọn câu rồi cộng/trừ điểm.
                </p>

                {roundIds.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {roundIds.map((roundId) => (
                            <button
                                key={roundId}
                                type="button"
                                onClick={() => setActiveRound(roundId)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${roundId === currentRound ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                            >
                                {ROUND_LABEL[roundId] ?? roundId}
                            </button>
                        ))}
                    </div>
                )}

                <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Tìm câu hỏi…"
                    aria-label="Tìm câu hỏi"
                    className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 font-sans text-sm outline-none focus:ring-2 focus:ring-ring"
                />

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
                    {rows.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">Thí sinh chưa trả lời câu nào.</p>
                    )}
                    {rows.length > 0 && visible.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">Không tìm thấy câu phù hợp.</p>
                    )}
                    <ul className="flex flex-col gap-1.5">
                        {visible.map((row) => {
                            const selected = row.questionId === questionId
                            return (
                                <li key={row.questionId}>
                                    <label
                                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                                    >
                                        <input
                                            type="radio"
                                            name="regrade-question"
                                            checked={selected}
                                            onChange={() => setQuestionId(row.questionId)}
                                            className="accent-primary"
                                        />
                                        <span className="min-w-0 flex-1 truncate">{row.text}</span>
                                        <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                                            {row.points ?? 0}đ
                                        </span>
                                    </label>
                                </li>
                            )
                        })}
                    </ul>
                </div>

                <label className="mt-4 block text-sm font-medium">
                    Điểm (+/-)
                    <input
                        type="number"
                        inputMode="numeric"
                        value={delta}
                        onChange={(event) => setDelta(event.target.value)}
                        placeholder="vd: 10 hoặc -5"
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-sans tabular-nums outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        disabled={!valid}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                    >
                        Lưu
                    </button>
                </div>
            </form>
        </div>
    )
}
