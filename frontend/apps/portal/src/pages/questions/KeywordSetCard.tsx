import { useQuery } from "@tanstack/react-query"
import { Lightbulb } from "lucide-react"
import { cn } from "cn"
import { api } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import { HINT_MAX, answerSummary, dateFormat } from "./model"
import { errorMessage } from "@shared/lib/error-text"
import type { BankQuestion, Paged, Status } from "./model"
import { PreviewText } from "./PreviewText"
import { SelectBox } from "./SelectBox"
import { RowActions } from "./RowActions"
import { StatusBadge } from "./StatusBadge"

export function KeywordSetCard({
    row,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
    onAddHint,
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
    onAddHint: (keywordId: string, openDialog?: boolean) => void
}) {
    const payload = row.payload as { code?: string }

    const hintParams = new URLSearchParams({ kind: "TEXT", keywordId: row.id, limit: "100", offset: "0" })
    const hints = useQuery({
        queryKey: ["keyword-hints", row.id],
        queryFn: () => api<Paged>(`/portal/questions?${hintParams.toString()}`),
        staleTime: 15_000,
    })

    const hintRows = [...(hints.data?.items ?? [])].sort((a, b) =>
        a.questionText.localeCompare(b.questionText, "vi", {
            numeric: true,
            sensitivity: "base",
        })
    )
    const shown = hintRows.slice(0, HINT_MAX)
    const overLimit = hintRows.length > HINT_MAX
    let hintVerb = "are"
    if (hintRows.length - HINT_MAX === 1) hintVerb = "is"
    const published = hintRows.filter((hint) => hint.status === "PUBLISHED").length

    return (
        <div className="overflow-hidden rounded-xl border bg-card">
            {
}
            <div className="flex items-center gap-3 px-5 py-4">
                <SelectBox row={row} selected={selected} onToggle={onToggleSelect} />
                <button
                    type="button"
                    onClick={() => onPreview(row)}
                    title="Preview this question"
                    className="min-w-0 break-all text-left text-base font-semibold hover:opacity-80"
                >
                    {payload.code || "(no keyword set)"}
                </button>
            </div>


            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-5 py-3">
                <StatusBadge status={row.status} />
                <span className="text-sm text-muted-foreground">{dateFormat.format(new Date(row.updatedAt))}</span>
                <div className="ml-auto">
                    <RowActions row={row} isAdmin={isAdmin} busy={busy} onEdit={onEdit} onTransition={onTransition} />
                </div>
            </div>
            {flash?.id === row.id && (
                <span role="alert" className="block px-5 pt-2 text-xs text-destructive">{flash.message}</span>
            )}

            <div className="grid gap-3 p-5">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Hints</span>
                    <span className="text-sm font-semibold">
                        {hintRows.length}
                        <span className="font-normal text-muted-foreground"> / {HINT_MAX}</span>
                        {published !== hintRows.length && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {published} published
                            </span>
                        )}
                    </span>
                </div>


                {hints.isPending && (
                    <p className="text-sm text-muted-foreground">Loading hints…</p>
                )}
                {hints.isError && (
                    <p role="alert" className="text-sm text-destructive">{errorMessage(hints.error)}</p>
                )}


                {shown.length > 0 && (
                    <ol className="grid gap-1.5">
                        {shown.map((hint, index) => {
                            const answer = answerSummary(hint)
                            const limitText = "no limit"
                            let hintAnswerCls = "text-muted-foreground"
                            if (answer) {
                                if (answer.includes("⚠")) hintAnswerCls = "text-destructive"
                            }
                            return (
                                <li key={hint.id} className="rounded-lg border bg-background/60 px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                        <SelectBox row={hint} selected={selected} onToggle={onToggleSelect} />
                                        <span className="w-5 shrink-0 text-muted-foreground">{index + 1}.</span>
                                        <PreviewText row={hint} onPreview={onPreview} className="min-w-40 flex-1 truncate font-medium" />
                                        <StatusBadge status={hint.status} />
                                        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                                            {limitText}
                                        </span>
                                        <RowActions
                                            row={hint}
                                            isAdmin={isAdmin}
                                            busy={busy}
                                            onEdit={onEdit}
                                            onTransition={onTransition}
                                        />
                                    </div>
                                    {answer && (
                                        <span
                                            title={answer}
                                            className={cn(
                                                "mt-1 block truncate pl-7 text-xs",
                                                hintAnswerCls
                                            )}
                                        >
                                            {answer}
                                        </span>
                                    )}
                                    {flash?.id === hint.id && (
                                        <span role="alert" className="mt-0.5 block pl-7 text-xs text-destructive">
                                            {flash.message}
                                        </span>
                                    )}
                                </li>
                            )
                        })}
                    </ol>
                )}

                {overLimit && (
                    <p className="text-xs text-destructive">
                        ⚠ {hintRows.length} hints — the maximum is {HINT_MAX}; the {hintRows.length - HINT_MAX}{" "}
                        beyond it {hintVerb} not shown. Convert or archive the extras.
                    </p>
                )}


                <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label="Add hint"
                        title="Add hint"
                        disabled={hints.isPending || hintRows.length >= HINT_MAX}
                        onClick={() => onAddHint(row.id)}
                    >
                        <Lightbulb className="size-3.5" aria-hidden />
                    </Button>
                </div>
            </div>
        </div>
    )
}
