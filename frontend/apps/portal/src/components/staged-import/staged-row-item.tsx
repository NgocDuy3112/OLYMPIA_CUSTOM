import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Pencil, RotateCcw, Save, Trash2, X } from "lucide-react"
import { cn } from "cn"
import { api } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { CELL_FIELDS, messageOf, type SourceCells, type StagedRow } from "./types"

export function StagedRowItem({
    batchId,
    row,
    onChanged,
}: {
    batchId: string
    row: StagedRow
    onChanged: () => void
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState<SourceCells>(row.cells)
    const [error, setError] = useState<string | null>(null)

    const patch = useMutation({
        mutationFn: (body: Partial<{ cells: SourceCells; dropped: boolean }>) =>
            api<StagedRow>(`/portal/question-imports/${batchId}/rows/${row.id}`, {
                method: "PATCH",
                body: JSON.stringify(body),
            }),
        onSuccess: () => {
            setEditing(false)
            setError(null)
            onChanged()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    const toggleDrop = () => patch.mutate({ dropped: !row.dropped })

    let dropLabel = "Bỏ"
    if (row.dropped) dropLabel = "Trở lại"
    let DropIcon = Trash2
    if (row.dropped) DropIcon = RotateCcw

    return (
        <li
            className={cn(
                "rounded-lg border bg-background/60 px-3 py-2",
                row.dropped && "opacity-50",
                row.error && "border-destructive/40"
            )}
        >
            <div className="flex flex-wrap items-start gap-2 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                    {row.sheet}
                </span>
                <span className="w-24 shrink-0 font-mono text-xs">{row.sourceId}</span>

                {editing && (
                    <div className="grid min-w-64 flex-1 gap-2">
                        {CELL_FIELDS.map((field) => (
                            <label key={field.key} className="grid gap-0.5 text-xs">
                                <span className="text-muted-foreground">{field.label}</span>
                                <input
                                    value={draft[field.key]}
                                    onChange={(event) =>
                                        setDraft({ ...draft, [field.key]: event.target.value })
                                    }
                                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                                />
                            </label>
                        ))}
                        <div className="flex justify-end gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                aria-label="Hủy"
                                title="Hủy"
                                onClick={() => {
                                    setDraft(row.cells)
                                    setEditing(false)
                                    setError(null)
                                }}
                            >
                                <X className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                                size="sm"
                                aria-label="Lưu"
                                title="Lưu"
                                disabled={patch.isPending}
                                onClick={() => patch.mutate({ cells: draft })}
                            >
                                <Save className="size-3.5" aria-hidden />
                            </Button>
                        </div>
                        {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                )}
                {!editing && (
                    <>
                        <div className="min-w-0 flex-1">
                            <span className="block truncate font-medium" title={row.cells.question}>
                                {row.cells.question}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground" title={row.cells.answer}>
                                {row.cells.answer && `→ ${row.cells.answer}`}
                            </span>
                            {row.media && (
                                <span className="block truncate text-xs text-muted-foreground">
                                    📎 {row.media.url}
                                </span>
                            )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                            <div className="flex flex-wrap justify-end gap-1">
                                {row.bucket && <Badge variant="secondary">{row.bucket}</Badge>}
                                {row.kind && <Badge variant="outline">{row.kind}</Badge>}
                            </div>
                            {row.error && (
                                <span className="max-w-72 text-right text-xs text-destructive" title={row.error}>
                                    {row.error}
                                </span>
                            )}
                            {!row.error && row.warning && (
                                <span
                                    className="max-w-72 text-right text-xs text-amber-700 dark:text-amber-500"
                                    title={row.warning}
                                >
                                    {row.warning}
                                </span>
                            )}
                        </div>

                        <div className="flex shrink-0 gap-1.5">
                            <Button
                                size="sm"
                                variant="outline"
                                aria-label="Sửa"
                                title="Sửa"
                                disabled={patch.isPending || row.dropped}
                                onClick={() => {
                                    setDraft(row.cells)
                                    setEditing(true)
                                }}
                            >
                                <Pencil className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                aria-label={dropLabel}
                                title={dropLabel}
                                disabled={patch.isPending}
                                onClick={toggleDrop}
                            >
                                {(
                                    <DropIcon className="size-3.5" aria-hidden />
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </li>
    )
}
