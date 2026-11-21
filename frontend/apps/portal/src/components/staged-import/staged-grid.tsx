import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Database, Link2 } from "lucide-react"
import { api } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import { ErrorPanel } from "@/components/page"
import { useMe } from "@/lib/session"
import { AddRowForm } from "./add-row-form"
import { CommitToMatchDialog } from "./commit-to-match-dialog"
import { StagedRowItem } from "./staged-row-item"
import { invalidateAll, messageOf, type CommitResult, type StagedBatch, type StagedRow } from "./types"

export function StagedGrid({ batch, onChanged }: { batch: StagedBatch; onChanged: () => void }) {
    const queryClient = useQueryClient()
    const { data: me } = useMe()
    const [committingToMatch, setCommittingToMatch] = useState(false)
    const [commitError, setCommitError] = useState<string | null>(null)

    const rows = useQuery({
        queryKey: ["question-imports", batch.id, "rows"],
        queryFn: () => api<{ items: StagedRow[] }>(`/portal/question-imports/${batch.id}/rows`),
        staleTime: 5_000,
    })

    const commit = useMutation({
        mutationFn: () =>
            api<CommitResult>(`/portal/question-imports/${batch.id}/commit`, { method: "POST" }),
        onSuccess: (result) => {
            if (result.errors.length > 0) {
                setCommitError(result.errors.map((failure) => failure.message).join(" · "))
                onChanged()
                return
            }
            setCommitError(null)
            invalidateAll(queryClient)
        },
        onError: (cause) => setCommitError(messageOf(cause)),
    })

    const items = rows.data?.items ?? []
    const live = items.filter((row) => !row.dropped)
    const toFix = live.filter((row) => row.error).length
    const ready = live.length - toFix

    return (
        <div className="mt-3 grid gap-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{ready} câu sẵn sàng</span>
                {toFix > 0 && (
                    <span className="text-destructive">{toFix} cần sửa</span>
                )}
                {batch.dropped > 0 && (
                    <span className="text-muted-foreground">{batch.dropped} đã bỏ</span>
                )}
            </div>

            {rows.isError && <ErrorPanel message={messageOf(rows.error)} />}

            {items.length > 0 && (
                <ul className="grid gap-1.5">
                    {items.map((row) => (
                        <StagedRowItem
                            key={row.id}
                            batchId={batch.id}
                            row={row}
                            onChanged={() =>
                                void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
                            }
                        />
                    ))}
                </ul>
            )}

            <AddRowForm
                batchId={batch.id}
                onAdded={() =>
                    void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
                }
            />

            {commitError && <p className="text-sm text-destructive">{commitError}</p>}

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    aria-label={`Commit ${live.length} câu vào bank (DRAFT)`}
                    title={`Commit ${live.length} câu vào bank (DRAFT)`}
                    disabled={commit.isPending || live.length === 0 || toFix > 0}
                    onClick={() => commit.mutate()}
                >
                    <Database className="size-4" aria-hidden />
                </Button>
                {me?.role === "ADMIN" && (
                    <Button
                        variant="outline"
                        aria-label="Commit vào trận…"
                        title="Commit vào trận…"
                        disabled={commit.isPending || live.length === 0 || toFix > 0}
                        onClick={() => setCommittingToMatch(true)}
                    >
                        <Link2 className="size-4" aria-hidden />
                    </Button>
                )}
            </div>

            {committingToMatch && (
                <CommitToMatchDialog
                    batchId={batch.id}
                    onCommitted={onChanged}
                    onClose={() => setCommittingToMatch(false)}
                />
            )}
        </div>
    )
}
