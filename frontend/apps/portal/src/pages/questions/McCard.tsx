import { cn } from "cn"
import { dateFormat } from "./model"
import type { BankQuestion, Status } from "./model"
import { PreviewText } from "./PreviewText"
import { SelectBox } from "./SelectBox"
import { RowActions } from "./RowActions"
import { StatusBadge } from "./StatusBadge"

export function McCard({
    row,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
}: {
    row: BankQuestion
    selected: Map<string, BankQuestion>
    onToggleSelect: (row: BankQuestion) => void
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
}) {
    const payload = row.payload as {
        options?: Array<{ id: string; text: string }>
        correctSet?: string[]
    }
    const options = payload.options ?? []
    const correct = new Set(payload.correctSet ?? [])
    const unanswerable = correct.size === 0

    return (
        <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                    <div className="pt-1">
                        <SelectBox row={row} selected={selected} onToggle={onToggleSelect} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <PreviewText row={row} onPreview={onPreview} className="text-sm font-semibold" />
                        {flash?.id === row.id && (
                            <span role="alert" className="block text-xs text-destructive">{flash.message}</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={row.status} />
                    <span className="text-xs text-muted-foreground">{dateFormat.format(new Date(row.updatedAt))}</span>
                </div>
            </div>

            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {options.map((option, index) => {
                    const isCorrect = correct.has(option.id)
                    return (
                        <li
                            key={option.id}
                            className={cn(
                                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                                isCorrect && "border-primary/40 bg-primary/5"
                            )}
                        >
                            <span className="shrink-0 font-semibold text-muted-foreground">
                                {String.fromCharCode(65 + index)}
                            </span>
                            <span className="truncate" title={option.text}>{option.text}</span>
                            {isCorrect && <span className="ml-auto shrink-0 text-xs font-medium text-primary">✓ correct</span>}
                        </li>
                    )
                })}
            </ul>

            {unanswerable && (
                <p className="mt-2 text-xs text-destructive">
                    ⚠ No correct option ticked — players cannot score this question.
                </p>
            )}

            <div className="mt-3 flex justify-end">
                <RowActions row={row} isAdmin={isAdmin} busy={busy} onEdit={onEdit} onTransition={onTransition} />
            </div>
        </div>
    )
}
