import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import { cn } from "cn"
import { api } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@shared/ui/dialog"
import { bucketLabel, bucketOf, dateFormat, shapeOf } from "./model"
import { errorMessage } from "@shared/lib/error-text"
import type { BankQuestion } from "./model"
import { StatusBadge } from "./StatusBadge"

export function InspectorDrawer({ row, onClose }: { row: BankQuestion | null; onClose: () => void }) {
    const usage = useQuery({
        queryKey: ["question-usage", row?.id ?? "none"],
        queryFn: () =>
            api<{
                items: Array<{
                    id: string
                    tournamentId: string
                    label: string
                    stageId: string
                    status: string
                }>
            }>(`/portal/questions/${row?.id ?? ""}/usage`),
        enabled: row !== null,
        staleTime: 15_000,
    })

    if (!row) return null

    const payload = row.payload as {
        options?: Array<{ id: string; text: string }>
        correctSet?: string[]
        acceptedAnswers?: string[]
        code?: string
    }
    const correct = new Set(payload.correctSet ?? [])
    const items = usage.data?.items ?? []
    const bucket = bucketLabel(bucketOf(row))
    let audienceLabel = ""
    if (payload.acceptedAnswers) audienceLabel = " · mặt khán giả nhìn thấy"
    let usageText = `${items.length} trận`
    if (usage.isPending) usageText = "…"

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent
                showCloseButton={false}
                className="inset-y-0 right-0 left-auto top-0 flex h-full w-full max-w-md translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-l bg-card p-5 sm:max-w-md"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{shapeOf(row)}</Badge>
                        <StatusBadge status={row.status} />
                        {bucket && <Badge variant="secondary">{bucket}</Badge>}
                    </div>
                    <Button variant="ghost" size="sm" aria-label="Đóng" onClick={onClose}>
                        <X className="size-4" />
                    </Button>
                </div>

                <DialogTitle className="mt-3 text-base font-semibold">{row.questionText}</DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                    Cập nhật {dateFormat.format(new Date(row.updatedAt))}
                </p>

                <div className="mt-4 grid gap-4 text-sm">
                    {payload.options && payload.options.length > 0 && (
                        <div className="grid gap-1.5">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Lựa chọn
                                {audienceLabel}
                            </span>
                            <ul className="grid gap-1.5">
                                {payload.options.map((option, index) => (
                                    <li
                                        key={option.id}
                                        className={cn(
                                            "flex items-center gap-2 rounded-lg border px-3 py-1.5",
                                            correct.has(option.id) && "border-primary/40 bg-primary/5"
                                        )}
                                    >
                                        <span className="font-semibold text-muted-foreground">
                                            {String.fromCharCode(65 + index)}
                                        </span>
                                        <span className="min-w-0 truncate">{option.text}</span>
                                        {correct.has(option.id) && (
                                            <span className="ml-auto shrink-0 text-xs font-medium text-primary">
                                                ✓
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {payload.acceptedAnswers && payload.acceptedAnswers.length > 0 && (
                        <div className="grid gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Đáp án chấp nhận
                            </span>
                            <ul className="list-inside list-disc text-sm">
                                {payload.acceptedAnswers.map((answer) => (
                                    <li key={answer}>{answer}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {payload.code !== undefined && (
                        <div className="grid gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Keyword (bí mật)
                            </span>
                            <p className="rounded-lg border px-3 py-2">{payload.code}</p>
                        </div>
                    )}

                    <div className="grid gap-1.5 border-t pt-3">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Đang dùng trong {usageText}
                        </span>
                        {usage.isError && (
                            <p className="text-xs text-destructive">{errorMessage(usage.error)}</p>
                        )}
                        {!usage.isPending && !usage.isError && items.length === 0 && (
                            <p className="text-xs text-muted-foreground">Chưa vào trận nào.</p>
                        )}
                        <ul className="grid gap-1">
                            {items.map((match) => (
                                <li key={match.id}>
                                    <a
                                        className="text-sm underline-offset-2 hover:underline"
                                        href={`/tournaments/${match.tournamentId}/matches/${match.id}`}
                                    >
                                        {match.label}
                                    </a>
                                    <span className="text-xs text-muted-foreground">
                                        {" "}
                                        · {match.stageId} · {match.status}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {items.length >= 20 && (
                            <p className="text-xs text-muted-foreground">
                                Chỉ hiện 20 trận gần nhất.
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-auto pt-4">
                    <Button variant="ghost" aria-label="Đóng" title="Đóng" onClick={onClose}>
                        <X className="size-4" aria-hidden />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
