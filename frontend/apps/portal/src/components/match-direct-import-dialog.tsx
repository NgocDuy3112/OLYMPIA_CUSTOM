import { useRef, useState } from "react"
import type { ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Upload, X } from "lucide-react"
import { Button } from "@shared/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog"
import { ApiError, UploadError, uploadWithProgress, type UploadRowError } from "@shared/lib/api"

type Phase = "idle" | "uploading" | "processing" | "success" | "error"

export function MatchDirectImportDialog({
    open,
    onClose,
    tournamentId,
    matchId,
    onDone,
}: {
    open: boolean
    onClose: () => void
    tournamentId: string
    matchId: string
    onDone?: (created: number, assemblyRevision: number) => void
}) {
    const queryClient = useQueryClient()
    const [file, setFile] = useState<File | null>(null)
    const [phase, setPhase] = useState<Phase>("idle")
    const [percent, setPercent] = useState(0)
    const [message, setMessage] = useState<string | null>(null)
    const [rows, setRows] = useState<UploadRowError[]>([])
    const [created, setCreated] = useState(0)
    const activeRef = useRef<AbortController | null>(null)

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
        void queryClient.invalidateQueries({ queryKey: ["match-detail", tournamentId, matchId] })
        void queryClient.invalidateQueries({ queryKey: ["eligible"] })
        void queryClient.invalidateQueries({ queryKey: ["questions"] })
        void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
    }

    const start = () => {
        if (file === null) return
        if (phase === "uploading") return
        if (phase === "processing") return
        setMessage(null)
        setRows([])
        setPercent(0)
        setPhase("uploading")

        const controller = new AbortController()
        activeRef.current = controller
        void uploadWithProgress(
            `/portal/tournaments/${tournamentId}/matches/${matchId}/questions/import`,
            file,
            (progress) => {
                setPercent(progress.percent)
                if (progress.processing) setPhase("processing")
            },
            controller.signal
        )
            .then((report) => {
                setCreated(report.created)
                setPhase("success")
                invalidate()
                onDone?.(report.created, report.assemblyRevision)
                onClose()
            })
            .catch((error: unknown) => {
                if (error instanceof UploadError) {
                    setMessage(error.message)
                    setRows(error.rows)
                    setPhase("error")
                    return
                }
                if (error instanceof ApiError) {
                    setMessage(error.message)
                    setRows([])
                    setPhase("error")
                }
            })
    }

    const close = () => {
        if (phase === "uploading" || phase === "processing") activeRef.current?.abort()
        onClose()
    }

    let canUpload = true
    if (file === null) canUpload = false
    if (phase === "uploading") canUpload = false
    if (phase === "processing") canUpload = false

    let busy = false
    if (phase === "uploading") busy = true
    if (phase === "processing") busy = true

    let status: ReactNode = null
    if (phase === "uploading") {
        status = (
            <div className="grid gap-1">
                <progress value={percent} max={100} aria-label="Tiến trình tải lên" className="w-full" />
                <p className="text-xs text-muted-foreground">{percent}% đã tải</p>
            </div>
        )
    }
    if (phase === "processing") {
        status = (
            <div className="grid gap-1">
                <progress aria-label="Đang xử lý" className="w-full" />
                <p className="text-xs text-muted-foreground">Đang xử lý…</p>
            </div>
        )
    }
    if (phase === "success") {
        status = <p className="text-sm text-emerald-600">Đã nhập {created} câu vào trận.</p>
    }

    let report: ReactNode = null
    if (message !== null) {
        report = (
            <div className="grid gap-1">
                <p role="alert" className="text-sm text-destructive">
                    {message}
                </p>
                {rows.length > 0 ? (
                    <ul className="grid max-h-40 gap-1 overflow-y-auto text-xs text-destructive">
                        {rows.map((row) => (
                            <li key={row.index}>
                                dòng {row.index}: {row.message}
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>
        )
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (next === false) close()
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Nhập đề vào trận</DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                    <label className="grid gap-1 text-sm" htmlFor="match-direct-import-file">
                        File đề (.xlsx hoặc .zip)
                    </label>
                    <input
                        id="match-direct-import-file"
                        type="file"
                        accept=".xlsx,.zip,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={(event) => {
                            const picked = event.target.files
                            if (picked === null) return
                            let next: File | null = null
                            if (picked.length > 0) next = picked[0]
                            setFile(next)
                            setMessage(null)
                            setRows([])
                            setPhase("idle")
                        }}
                        className="block w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-muted file:px-3 file:py-1 file:text-sm"
                    />
                    {status}
                    {report}
                </div>

                <DialogFooter className="items-center gap-2">
                    <Button variant="outline" aria-label="Đóng" title="Đóng" onClick={close} disabled={busy}>
                        <X className="size-4" aria-hidden />
                    </Button>
                    <Button
                        aria-label="Tải lên"
                        title="Tải lên"
                        onClick={start}
                        disabled={canUpload === false}
                    >
                        <Upload className="size-4" aria-hidden />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
