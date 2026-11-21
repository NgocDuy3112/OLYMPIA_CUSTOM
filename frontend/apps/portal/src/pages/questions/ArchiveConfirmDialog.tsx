import { Archive, X } from "lucide-react"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import type { BankQuestion } from "./model"

export function ArchiveConfirmDialog({
    row,
    error,
    pending,
    onCancel,
    onConfirm,
}: {
    row: BankQuestion | null
    error: string | null
    pending: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    if (!row) return null
    return (
        <Dialog open onOpenChange={(next) => { if (!next) onCancel() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Archive this question?</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                    <p className="rounded-lg border px-3 py-2 text-sm text-foreground">
                        {row.questionText}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        An archived question is immutable: it can no longer be edited, restored, or published.
                        Matches assembled from it keep their frozen copy.
                    </p>
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" aria-label="Cancel" title="Cancel" onClick={onCancel} disabled={pending}>
                        <X className="size-4" aria-hidden />
                    </Button>
                    <Button aria-label="Archive" title="Archive" onClick={onConfirm} disabled={pending}>
                        <Archive className="size-4" aria-hidden />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
