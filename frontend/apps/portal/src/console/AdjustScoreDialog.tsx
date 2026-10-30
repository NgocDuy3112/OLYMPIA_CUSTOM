import { useState } from "react"

/**
 * The controller's score correction — one audited, match-level delta (the
 * backend ledger folds it into the scoreboard and the frozen results). Rendered
 * by the controller host whenever a rail card's ± chip opened it.
 */
export function AdjustScoreDialog({ playerName, onCancel, onSubmit }: {
    playerName: string
    onCancel: () => void
    onSubmit: (delta: number, reason: string) => void
}) {
    const [delta, setDelta] = useState("")
    const [reason, setReason] = useState("")

    const parsed = Number.parseInt(delta, 10)
    const valid = Number.isInteger(parsed) && parsed !== 0 && reason.trim().length > 0

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onCancel}>
            <form
                role="dialog"
                aria-label={`Điều chỉnh điểm của ${playerName}`}
                className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg"
                onClick={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                    event.preventDefault()
                    if (valid) onSubmit(parsed, reason.trim())
                }}
            >
                <h2 className="font-display text-lg font-bold uppercase">Điều chỉnh điểm</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Thí sinh: <span className="font-medium text-foreground">{playerName}</span> — cộng/trừ điểm cả trận (lý do được lưu).
                </p>

                <label className="mt-4 block text-sm font-medium">
                    Điểm (+/-)
                    <input
                        type="number"
                        inputMode="numeric"
                        value={delta}
                        onChange={(event) => setDelta(event.target.value)}
                        placeholder="vd: 10 hoặc -5"
                        autoFocus
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-sans tabular-nums outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>

                <label className="mt-3 block text-sm font-medium">
                    Lý do
                    <input
                        type="text"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="vd: chấm lại câu Về đích"
                        maxLength={200}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-sans outline-none focus:ring-2 focus:ring-ring"
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
