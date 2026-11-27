import { useId, useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { Label } from "@shared/ui/label"

export function AdjustScoreDialog({ playerName, pending, error, onCancel, onSubmit }: {
    playerName: string
    pending: boolean
    error: string | null
    onCancel: () => void
    onSubmit: (delta: number, reason: string) => void
}) {
    const formId = useId()
    const [delta, setDelta] = useState("")
    const [reason, setReason] = useState("")

    const parsed = Number.parseInt(delta, 10)
    const valid = Number.isInteger(parsed) && parsed !== 0 && reason.trim().length > 0

    return (
        <Dialog open onOpenChange={(next) => { if (!next && !pending) onCancel() }}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Điều chỉnh điểm</DialogTitle>
                    <DialogDescription>
                        Thí sinh: <span className="font-medium text-foreground">{playerName}</span> — cộng/trừ điểm cả trận (lý do được lưu).
                    </DialogDescription>
                </DialogHeader>

                <form
                    id={formId}
                    className="grid gap-3"
                    onSubmit={(event) => {
                        event.preventDefault()
                        if (valid) onSubmit(parsed, reason.trim())
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${formId}-delta`}>Điểm (+/-)</Label>
                        <Input
                            id={`${formId}-delta`}
                            type="number"
                            inputMode="numeric"
                            value={delta}
                            onChange={(event) => setDelta(event.target.value)}
                            placeholder="vd: 10 hoặc -5"
                            autoFocus
                            className="tabular-nums"
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor={`${formId}-reason`}>Lý do</Label>
                        <Input
                            id={`${formId}-reason`}
                            type="text"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="vd: chấm lại câu Về đích"
                            maxLength={200}
                        />
                    </div>

                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                </form>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                        Hủy
                    </Button>
                    <Button type="submit" form={formId} disabled={!valid || pending}>
                        {pending ? "Đang lưu…" : "Lưu"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
