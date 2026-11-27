import type { BankQuestion } from "./model"

export function SelectBox({
    row,
    selected,
    onToggle,
}: {
    row: BankQuestion
    selected: Map<string, BankQuestion>
    onToggle: (row: BankQuestion) => void
}) {
    return (
        <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={() => onToggle(row)}
            aria-label={`Chọn: ${row.questionText}`}
            className="size-4 shrink-0 rounded-sm accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
    )
}

export function SelectAllBox({
    rows,
    selected,
    onToggle,
}: {
    rows: BankQuestion[]
    selected: Map<string, BankQuestion>
    onToggle: (row: BankQuestion) => void
}) {
    const picked = rows.filter((row) => selected.has(row.id)).length
    const all = rows.length > 0 && picked === rows.length
    const some = picked > 0 && !all

    return (
        <input
            type="checkbox"
            ref={(element) => {
                if (element) element.indeterminate = some
            }}
            checked={all}
            disabled={rows.length === 0}
            onChange={() => {
                const select = !all
                for (const row of rows) {
                    if (selected.has(row.id) !== select) onToggle(row)
                }
            }}
            aria-label="Chọn tất cả câu trong nhóm"
            className="size-4 shrink-0 rounded-sm accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
    )
}
