import { useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, Trash2, X } from "lucide-react"
import { api } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { StagedGrid } from "./staged-import/staged-grid"
import { messageOf, type StagedBatch } from "./staged-import/types"

export function StagedImportBanner() {
    const queryClient = useQueryClient()
    const [open, setOpen] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const [discardError, setDiscardError] = useState<string | null>(null)

    const imports = useQuery({
        queryKey: ["question-imports"],
        queryFn: () =>
            api<{ active: StagedBatch | null; batches: StagedBatch[] }>("/portal/question-imports"),
        staleTime: 5_000,
    })

    const discard = useMutation({
        mutationFn: (batchId: string) =>
            api<void>(`/portal/question-imports/${batchId}`, { method: "DELETE" }),
        onMutate: () => setDiscardError(null),
        onSuccess: () => {
            setConfirmDiscard(false)
            setOpen(false)
            setDiscardError(null)
            void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
        },
        onError: (cause) => setDiscardError(messageOf(cause)),
    })

    const active = imports.data?.active
    if (!active) return null

    const changed = () => void queryClient.invalidateQueries({ queryKey: ["question-imports"] })

    let fixBadge: ReactNode = <Badge variant="secondary">{active.ready} sẵn sàng</Badge>
    if (active.toFix > 0) fixBadge = <Badge variant="destructive">{active.toFix} cần sửa</Badge>
    let reviewLabel = "Review"
    if (open) reviewLabel = "Ẩn"
    let ReviewIcon = Eye
    if (open) ReviewIcon = EyeOff

    return (
        <div className="rounded-xl border border-amber-600/40 bg-amber-500/10 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Staged import</span>
                <span className="text-sm text-muted-foreground">
                    {active.sourceName ?? "workbook"} · {active.rowCount} rows
                </span>
                {fixBadge}
                {active.dropped > 0 && (
                    <Badge variant="outline">{active.dropped} đã bỏ</Badge>
                )}

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        aria-label={reviewLabel}
                        title={reviewLabel}
                        onClick={() => setOpen((value) => !value)}
                    >
                        {(
                            <ReviewIcon className="size-4" aria-hidden />
                        )}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Bỏ batch"
                        title="Bỏ batch"
                        disabled={discard.isPending}
                        onClick={() => setConfirmDiscard(true)}
                    >
                        <Trash2 className="size-4" aria-hidden />
                    </Button>
                </div>
            </div>

            {discardError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                    Không bỏ được batch — {discardError}
                </p>
            )}

            {open && <StagedGrid batch={active} onChanged={changed} />}

            {confirmDiscard && (
                <Dialog open onOpenChange={(next) => { if (!next) setConfirmDiscard(false) }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Bỏ batch này?</DialogTitle>
                        </DialogHeader>
                        <DialogFooter className="items-center gap-2">
                            <Button
                                variant="outline"
                                aria-label="Hủy"
                                title="Hủy"
                                onClick={() => setConfirmDiscard(false)}
                            >
                                <X className="size-4" aria-hidden />
                            </Button>
                            <Button
                                variant="destructive"
                                aria-label="Bỏ batch"
                                title="Bỏ batch"
                                disabled={discard.isPending}
                                onClick={() => discard.mutate(active.id)}
                            >
                                <Trash2 className="size-4" aria-hidden />
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}
