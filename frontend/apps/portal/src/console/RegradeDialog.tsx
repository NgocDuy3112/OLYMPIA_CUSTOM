import { useId, useMemo, useState } from "react"
import { ROUND_LABEL } from "@shared/deck/geometry"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { Label } from "@shared/ui/label"

export function RegradeDialog({ playerName, rows, pending, error, onCancel, onSubmit }: {
    playerName: string
    rows: Array<{ questionId: string; text: string; points: number | null; roundId: string }>
    pending: boolean
    error: string | null
    onCancel: () => void
    onSubmit: (questionId: string, delta: number) => void
}) {
    const formId = useId()
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
        <Dialog open onOpenChange={(next) => { if (!next && !pending) onCancel() }}>
            <DialogContent
                showCloseButton={false}
                initialFocus={false}
                className="flex max-h-[80vh] w-full flex-col sm:max-w-lg"
            >
                <DialogHeader>
                    <DialogTitle>Sửa điểm câu trả lời</DialogTitle>
                    <DialogDescription>
                        Thí sinh: <span className="font-medium text-foreground">{playerName}</span> — chọn câu rồi cộng/trừ điểm.
                    </DialogDescription>
                </DialogHeader>

                <form
                    id={formId}
                    className="flex min-h-0 flex-1 flex-col gap-3"
                    onSubmit={(event) => {
                        event.preventDefault()
                        if (valid && questionId !== null) onSubmit(questionId, parsed)
                    }}
                >
                    {roundIds.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {roundIds.map((roundId) => {
                                const active = roundId === currentRound
                                return (
                                    <Button
                                        key={roundId}
                                        type="button"
                                        size="xs"
                                        variant={active ? "default" : "outline"}
                                        aria-pressed={active}
                                        onClick={() => setActiveRound(roundId)}
                                    >
                                        {ROUND_LABEL[roundId] ?? roundId}
                                    </Button>
                                )
                            })}
                        </div>
                    )}

                    <Input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        // Enter belongs to the search here, not to the delta submit.
                        onKeyDown={(event) => {
                            if (event.key === "Enter") event.preventDefault()
                        }}
                        placeholder="Tìm câu hỏi…"
                        aria-label="Tìm câu hỏi"
                    />

                    <div className="min-h-0 flex-1 overflow-y-auto">
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
                                                name={`${formId}-question`}
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

                    <div className="grid gap-1.5">
                        <Label htmlFor={`${formId}-delta`}>Điểm (+/-)</Label>
                        <Input
                            id={`${formId}-delta`}
                            type="number"
                            inputMode="numeric"
                            value={delta}
                            onChange={(event) => setDelta(event.target.value)}
                            placeholder="vd: 10 hoặc -5"
                            className="tabular-nums"
                        />
                    </div>

                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                </form>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                        Hủy
                    </Button>
                    <Button type="submit" form={formId} disabled={!valid || pending}>
                        {pending ? "Đang lưu…" : "Lưu"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
