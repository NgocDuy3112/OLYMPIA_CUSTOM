import { Trash2, X } from "lucide-react"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"

export function ConfirmDeleteDialog({
    title,
    subject,
    description,
    error,
    pending,
    onCancel,
    onConfirm,
}: {
    title: string
    subject: string
    description: string
    error: string | null
    pending: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    return (
        <Dialog open onOpenChange={(next) => { if (!next && !pending) onCancel() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2">
                    <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">{subject}</p>
                    <DialogDescription>{description}</DialogDescription>
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" aria-label="Cancel" title="Cancel" onClick={onCancel} disabled={pending}>
                        <X className="size-4" aria-hidden />
                    </Button>
                    <Button variant="destructive" aria-label="Delete" title="Delete" onClick={onConfirm} disabled={pending}>
                        <Trash2 className="size-4" aria-hidden />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
