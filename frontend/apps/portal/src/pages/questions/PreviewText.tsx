import { cn } from "cn"
import type { BankQuestion } from "./model"

export function PreviewText({
    row,
    className,
    onPreview,
}: {
    row: BankQuestion
    className?: string
    onPreview: (row: BankQuestion) => void
}) {
    return (
        <button
            type="button"
            onClick={() => onPreview(row)}
            title={`Preview: ${row.questionText}`}
            className={cn(
                "block max-w-full truncate rounded-sm text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
                className
            )}
        >
            {row.questionText}
        </button>
    )
}
