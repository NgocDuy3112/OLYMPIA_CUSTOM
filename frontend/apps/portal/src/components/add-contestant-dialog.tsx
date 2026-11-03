import { useState, type FormEvent } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { useCreateContestant } from "@/lib/tournament"

/**
 * Add contestant — a dialog, like every other create on this page (new match, new
 * tournament, invite operator). One job, one commit point, and the roster table is
 * never pushed around by a form living in its header.
 *
 * The EMAIL is the decision this dialog exists to make explicit: without one the
 * contestant is a show-floor identity (plays through the PIN, keeps no history);
 * with one, their own Google sign-in attaches to this row later and their matches
 * were never anywhere else. That sentence belongs next to the field, not in a
 * tooltip.
 */
export function AddContestantDialog({
    tournamentId,
    open,
    onOpenChange,
}: {
    tournamentId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const create = useCreateContestant(tournamentId)
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")

    // Mounted per opening (the parent renders it conditionally), so the fields start
    // empty every time — no draft from the previous contestant.
    const submit = (event: FormEvent) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || create.isPending) return
        const address = email.trim()
        create.mutate(
            address ? { displayName: trimmed, email: address } : { displayName: trimmed },
            {
                onSuccess: () => {
                    setName("")
                    setEmail("")
                    onOpenChange(false)
                },
            }
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={submit}>
                    <FieldGroup>
                        <DialogHeader>
                            <DialogTitle>Thêm thí sinh</DialogTitle>
                            <DialogDescription>
                                Tạo một thí sinh và xếp vào danh sách của giải này.
                            </DialogDescription>
                        </DialogHeader>

                        <Field>
                            <FieldLabel htmlFor="contestant-name">Tên</FieldLabel>
                            <Input
                                id="contestant-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Tên hiện trên bảng đấu"
                                maxLength={100}
                                autoFocus
                                required
                            />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="contestant-email">Email (không bắt buộc)</FieldLabel>
                            <Input
                                id="contestant-email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="email@example.com"
                                maxLength={255}
                            />
                            <FieldDescription>
                                Điền email để thí sinh giữ được lịch sử khi tự đăng nhập Google. Bỏ trống: chỉ vào
                                trận bằng mã PIN, không có tài khoản.
                            </FieldDescription>
                        </Field>

                        {create.isError ? (
                            <p role="alert" className="text-sm text-destructive">{create.error.message}</p>
                        ) : null}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={create.isPending}
                            >
                                Huỷ
                            </Button>
                            <Button type="submit" disabled={create.isPending || name.trim().length === 0}>
                                {create.isPending ? "Đang thêm…" : "Thêm"}
                            </Button>
                        </DialogFooter>
                    </FieldGroup>
                </form>
            </DialogContent>
        </Dialog>
    )
}
