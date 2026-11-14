import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Download, ShieldCheck, X } from "lucide-react"
import { ApiError, api } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog"

interface BatchErrorRow {
    index: number
    code: string
    message: string
    details: string[]
}

interface BatchReport {
    dryRun: boolean
    total: number
    created: number
    ids: string[]
    errors: BatchErrorRow[]
}

interface ExcelRowSummary {
    index: number
    sheet: string
    sourceId: string
    bucket: string
    kind: string
}

interface ExcelReport extends BatchReport {
    skipped: number
    warnings: Array<{ index: number; message: string }>
    rows: ExcelRowSummary[]
    /** set when the server staged the rows instead of writing them (dirty file,
   *  or `stage=true` — the match-tab path, where commit-to-match finishes it) */
    stagedBatchId?: string | null
}

/** Where a finished import should land instead of sitting in the bank. */
export interface MatchImportTarget {
    tournamentId: string
    matchId: string
    onDone: (created: number, assemblyRevision: number | null) => void
}

function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Có gì đó không ổn — thử lại."
}

/**
 * The workbook upload, one component for both doors:
 *  - no `commitTo` → the question bank's flow (validate → import, staged for
 *    review when rows fail);
 *  - `commitTo` → the match's flow: `stage=true` then commit-to-match, which
 *    publishes the rows into the bank AND assembles them into that match.
 */
export function ExcelImportDialog({
    open,
    onClose,
    commitTo,
}: {
    open: boolean
    onClose: () => void
    commitTo?: MatchImportTarget
}) {
    const queryClient = useQueryClient()
    const [file, setFile] = useState<File | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [commitError, setCommitError] = useState<string | null>(null)
    const [excel, setExcel] = useState<ExcelReport | null>(null)
    const [validatedFile, setValidatedFile] = useState<File | null>(null)

    const postExcel = (dryRun: boolean, chosen: File) => {
        const form = new FormData()
        form.append("file", chosen, chosen.name)
        const params = new URLSearchParams({ dryRun: String(dryRun) })
        // staging is what the commit path needs; a dry run writes nothing at all
        if (commitTo && !dryRun) params.set("stage", "true")
        return api<ExcelReport>(`/portal/questions/import-excel?${params.toString()}`, {
            method: "POST",
            body: form,
        })
    }

    const validateExcel = useMutation({
        mutationFn: (chosen: File) => postExcel(true, chosen),
        onSuccess: (result, chosen) => {
            setExcel(result)
            setValidatedFile(chosen)
        },
        onError: (cause) => setParseError(messageOf(cause)),
    })

    const commit = useMutation({
        mutationFn: (batchId: string) =>
            api<{ created: number; assemblyRevision: number | null }>(
                `/portal/question-imports/${batchId}/commit-to-match`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        tournamentId: commitTo!.tournamentId,
                        matchId: commitTo!.matchId,
                    }),
                }
            ),
        onSuccess: (result) => {
            void queryClient.invalidateQueries({
                queryKey: ["matches", commitTo!.tournamentId],
            })
            void queryClient.invalidateQueries({
                queryKey: ["match-detail", commitTo!.tournamentId, commitTo!.matchId],
            })
            void queryClient.invalidateQueries({ queryKey: ["eligible"] })
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
            commitTo!.onDone(result.created, result.assemblyRevision ?? null)
            onClose()
        },
        onError: (cause) => setCommitError(messageOf(cause)),
    })

    const runExcelImport = useMutation({
        mutationFn: (chosen: File) => postExcel(false, chosen),
        onSuccess: (report) => {
            if (commitTo) {
                if (report.stagedBatchId) {
                    setCommitError(null)
                    commit.mutate(report.stagedBatchId)
                    return
                }
                setCommitError("Máy chủ không trả về batch vừa nhập — thử lại.")
                return
            }
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
            void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
            onClose()
        },
        onError: (cause) => setParseError(messageOf(cause)),
    })

    const onValidate = () => {
        if (file) validateExcel.mutate(file)
    }
    const onImport = () => {
        if (file && excel) runExcelImport.mutate(file)
    }

    const currentReport = excel
    const busy = validateExcel.isPending || runExcelImport.isPending || commit.isPending
    const importError = runExcelImport

    const reason = (() => {
        if (parseError) return parseError
        if (!file) return "Choose a .zip or .xlsx file, then validate"
        if (!excel) return "Validate first (dry run)"
        if (validatedFile !== file) return "File changed since validation — validate again"
        return null
    })()

    const willStage = currentReport !== null && currentReport.errors.length > 0
    const importLabel = commitTo
        ? commit.isPending
            ? "Đang ghi vào trận…"
            : "Nhập vào trận"
        : willStage
          ? "Import & review"
          : "Import"

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose()
            }}
        >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {commitTo ? "Nhập câu hỏi vào trận" : "Import questions"}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                    <label className="grid gap-1 text-sm" htmlFor="import-xlsx">
                        Bundle (.zip or .xlsx)
                    </label>
                    <input
                        id="import-xlsx"
                        type="file"
                        accept=".zip,.xlsx,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={(event) => {
                            setFile(event.target.files?.[0] ?? null)
                            setExcel(null)
                            setParseError(null)
                        }}
                        className="block w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-muted file:px-3 file:py-1 file:text-sm"
                    />

                    {currentReport && currentReport.errors.length === 0 && (
                        <p className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm">
                            ✓ {currentReport.total} question{currentReport.total === 1 ? "" : "s"} valid — ready to import.
                        </p>
                    )}

                    {currentReport && currentReport.errors.length > 0 && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                            <p className="text-sm font-medium text-destructive">
                                {currentReport.errors.length} of {currentReport.total} rows failed:
                            </p>
                            <ul className="mt-1 grid gap-1 text-xs text-destructive">
                                {currentReport.errors.map((failure) => (
                                    <li key={failure.index}>
                                        {excel
                                            ? `${excel.rows[failure.index]?.sheet ?? "?"} ${
                                                  excel.rows[failure.index]?.sourceId || `#${failure.index + 1}`
                                              }`
                                            : `Row ${failure.index + 1}`}
                                        : [{failure.code}] {failure.message}
                                        {failure.details.length > 0 ? ` — ${failure.details.join("; ")}` : ""}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {excel && excel.skipped > 0 && (
                        <p className="text-xs text-muted-foreground">
                            {excel.skipped} pre-seeded row{excel.skipped === 1 ? "" : "s"} left empty — skipped.
                        </p>
                    )}

                    {excel && excel.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                {excel.warnings.length} warning{excel.warnings.length === 1 ? "" : "s"} — these rows
                                still import:
                            </p>

                            <ul className="mt-1 max-h-40 grid gap-1 overflow-y-auto text-xs text-amber-800 dark:text-amber-500">
                                {excel.warnings.map((warning) => (
                                    <li key={warning.index}>
                                        {excel.rows[warning.index]?.sourceId || `Row ${warning.index + 1}`}:{" "}
                                        {warning.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {excel && excel.rows.length > 0 && (
                        <div className="rounded-lg border">
                            <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                {excel.rows.length} row{excel.rows.length === 1 ? "" : "s"} →{" "}
                                {new Set(excel.rows.map((row) => row.bucket)).size} group(s)
                            </p>
                            <ul className="max-h-40 overflow-y-auto px-3 py-2 font-mono text-xs">
                                {excel.rows.map((row) => (
                                    <li key={row.index} className="flex gap-2">
                                        <span className="w-24 shrink-0 text-muted-foreground">{row.sheet}</span>
                                        <span className="w-24 shrink-0">{row.sourceId || `#${row.index + 1}`}</span>
                                        <span>{row.bucket}</span>
                                        <span className="ml-auto text-muted-foreground">{row.kind}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {importError.isError && (
                        <p role="alert" className="text-sm text-destructive">
                            {messageOf(importError.error)} — re-validate and try again.
                        </p>
                    )}

                    {commitError && (
                        <p role="alert" className="text-sm text-destructive">
                            {commitError} — batch vẫn còn ở trang Ngân hàng để bạn sửa và commit lại.
                        </p>
                    )}
                </div>

                <DialogFooter className="items-center gap-2">
                    <span className="mr-auto text-xs text-muted-foreground">{reason}</span>
                    <Button variant="outline" aria-label="Cancel" title="Cancel" onClick={onClose} disabled={busy}>
                        <X className="size-4" aria-hidden />
                    </Button>
                    <Button
                        variant="secondary"
                        aria-label="Validate (dry run)"
                        title="Validate (dry run)"
                        onClick={onValidate}
                        disabled={busy || !file}
                    >
                        <ShieldCheck className="size-4" aria-hidden />
                    </Button>
                    <Button
                        aria-label={importLabel}
                        title={importLabel}
                        onClick={onImport}
                        disabled={reason !== null || currentReport === null || busy}
                    >
                        <Download className="size-4" aria-hidden />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
