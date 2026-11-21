import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Plus, X } from "lucide-react"
import { api } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import { EMPTY_CELLS, SHEETS, messageOf, type SourceCells, type StagedRow } from "./types"

export function AddRowForm({ batchId, onAdded }: { batchId: string; onAdded: () => void }) {
    const [open, setOpen] = useState(false)
    const [sheet, setSheet] = useState<string>(SHEETS[0])
    const [sourceId, setSourceId] = useState("")
    const [draft, setDraft] = useState<SourceCells>(EMPTY_CELLS)
    const [error, setError] = useState<string | null>(null)

    const add = useMutation({
        mutationFn: () =>
            api<StagedRow>(`/portal/question-imports/${batchId}/rows`, {
                method: "POST",
                body: JSON.stringify({ sheet, sourceId, cells: draft }),
            }),
        onSuccess: () => {
            setOpen(false)
            setSourceId("")
            setDraft(EMPTY_CELLS)
            setError(null)
            onAdded()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    if (!open) {
        return (
            <Button
                size="sm"
                variant="outline"
                aria-label="Thêm row"
                title="Thêm row"
                onClick={() => setOpen(true)}
            >
                <Plus className="size-3.5" aria-hidden />
            </Button>
        )
    }

    return (
        <div className="grid gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap gap-2">
                <select
                    value={sheet}
                    onChange={(event) => setSheet(event.target.value)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                    {SHEETS.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
                <input
                    value={sourceId}
                    onChange={(event) => setSourceId(event.target.value)}
                    placeholder="ID (VD: GM_KEY)"
                    className="h-8 w-40 rounded-lg border border-input bg-transparent px-2 text-sm font-mono"
                />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                <input
                    value={draft.question}
                    onChange={(event) => setDraft({ ...draft, question: event.target.value })}
                    placeholder="Câu hỏi"
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                />
                <input
                    value={draft.answer}
                    onChange={(event) => setDraft({ ...draft, answer: event.target.value })}
                    placeholder="Đáp án"
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    aria-label="Hủy"
                    title="Hủy"
                    onClick={() => { setOpen(false); setError(null) }}
                >
                    <X className="size-3.5" aria-hidden />
                </Button>
                <Button
                    size="sm"
                    aria-label="Thêm"
                    title="Thêm"
                    disabled={add.isPending || !sourceId.trim() || !draft.question.trim()}
                    onClick={() => add.mutate()}
                >
                    <Plus className="size-3.5" aria-hidden />
                </Button>
            </div>
        </div>
    )
}
