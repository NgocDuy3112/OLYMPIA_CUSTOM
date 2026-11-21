import { useState } from "react"
import { ListPlus, Pencil } from "lucide-react"
import { Button } from "@shared/ui/button"
import { TRANSITIONS, TRANSITION_ICON } from "./model"
import type { BankQuestion, Status } from "./model"
import { AddToMatchDialog } from "./AddToMatchDialog"

export function RowActions({
    row,
    isAdmin,
    busy,
    onEdit,
    onTransition,
}: {
    row: BankQuestion
    isAdmin: boolean
    busy: boolean
    onEdit: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
}) {
    const [adding, setAdding] = useState(false)
    return (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
                variant="outline"
                size="sm"
                aria-label="Edit"
                title="Edit"
                disabled={row.status === "ARCHIVED" || busy}
                onClick={() => onEdit(row)}
            >
                <Pencil className="size-3.5" aria-hidden />
            </Button>
            <Button
                variant="outline"
                size="sm"
                aria-label="Thêm vào trận"
                title="Thêm vào trận"
                disabled={row.status !== "PUBLISHED" || busy}
                onClick={() => setAdding(true)}
            >
                <ListPlus className="size-3.5" aria-hidden />
            </Button>
            {TRANSITIONS[row.status].map((step) => {
                const blocked = step.adminOnly && !isAdmin
                const Icon = TRANSITION_ICON[step.label] ?? Pencil
                let stepVariant: "ghost" | "outline" = "outline"
                if (step.to === "ARCHIVED") stepVariant = "ghost"
                return (
                    <Button
                        key={step.to}
                        variant={stepVariant}
                        size="sm"
                        aria-label={step.label}
                        title={step.label}
                        disabled={blocked || busy}
                        onClick={() => onTransition(row, step.to)}
                    >
                        <Icon className="size-3.5" aria-hidden />
                    </Button>
                )
            })}
            {adding && <AddToMatchDialog rows={[row]} onClose={() => setAdding(false)} />}
        </div>
    )
}
