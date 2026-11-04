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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { useCreateContestant, useEnrollByEmail } from "@/lib/tournament"

/**
 * Thêm thí sinh — a dialog, like every other create on this page (new match, new
 * tournament, invite operator). One job, one commit point, and the roster table is
 * never pushed around by a form living in its header.
 *
 * TWO doors, because there are two kinds of contestant:
 *
 *  · **Enroll an account (email)** — the player registered themselves (email +
 *    password of their own choosing, verified by mail). The operator types the
 *    ADDRESS and never sees a password; the server refuses an address nobody
 *    registered, one that has not verified yet, and one already on the roster.
 *  · **Create a show-floor identity (name + optional email)** — a contestant who
 *    never signs in still needs a seat. Kept for exactly that case.
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
    const enroll = useEnrollByEmail(tournamentId)

    const [mode, setMode] = useState("enroll")
    const [email, setEmail] = useState("")
    const [name, setName] = useState("")

    // Mounted per opening (the parent renders it conditionally), so the fields start
    // empty every time — no draft from the previous contestant.
    const close = () => {
        setName("")
        setEmail("")
        create.reset()
        enroll.reset()
        onOpenChange(false)
    }

    const submitEnroll = (event: FormEvent) => {
        event.preventDefault()
        const address = email.trim()
        if (!address || enroll.isPending) return
        enroll.mutate(address, { onSuccess: close })
    }

    const submitCreate = (event: FormEvent) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || create.isPending) return
        const address = email.trim()
        create.mutate(
            address ? { displayName: trimmed, email: address } : { displayName: trimmed },
            { onSuccess: close }
        )
    }

    const error = mode === "enroll" ? enroll.error : create.error
    const pending = mode === "enroll" ? enroll.isPending : create.isPending

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
            <DialogContent>
                <form onSubmit={mode === "enroll" ? submitEnroll : submitCreate}>
                    <FieldGroup>
                        <DialogHeader>
                            <DialogTitle>Thêm thí sinh</DialogTitle>
                            <DialogDescription>
                                Ghi danh một tài khoản thí sinh đã đăng ký, hoặc tạo danh tính tại chỗ.
                            </DialogDescription>
                        </DialogHeader>

                        <Tabs
                            value={mode}
                            onValueChange={(value) => {
                                // Each mode has its own fields: switching drops the
                                // other's draft rather than carrying it over.
                                setMode(value)
                                setName("")
                                setEmail("")
                                create.reset()
                                enroll.reset()
                            }}
                        >
                            <TabsList variant="line" className="justify-start gap-6 border-b">
                                <TabsTrigger value="enroll">Ghi danh theo email</TabsTrigger>
                                <TabsTrigger value="create">Tạo danh tính tại chỗ</TabsTrigger>
                            </TabsList>

                            <TabsContent value="enroll">
                                <Field>
                                    <FieldLabel htmlFor="enroll-email">Email của thí sinh</FieldLabel>
                                    <Input
                                        id="enroll-email"
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="email@example.com"
                                        maxLength={255}
                                        autoFocus
                                        required
                                    />
                                    <FieldDescription>
                                        Thí sinh phải đăng ký tài khoản và bấm xác thực trong email trước.
                                        Ban điều hành ghi danh địa chỉ — không biết và không cần mật khẩu.
                                    </FieldDescription>
                                </Field>
                            </TabsContent>

                            <TabsContent value="create">
                                <Field>
                                    <FieldLabel htmlFor="contestant-name">Tên</FieldLabel>
                                    <Input
                                        id="contestant-name"
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        placeholder="Tên hiện trên bảng đấu"
                                        maxLength={100}
                                        required
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="contestant-email">
                                        Email (không bắt buộc)
                                    </FieldLabel>
                                    <Input
                                        id="contestant-email"
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="email@example.com"
                                        maxLength={255}
                                    />
                                    <FieldDescription>
                                        Điền email để thí sinh tự đăng nhập giữ được lịch sử. Bỏ trống: thí
                                        sinh chỉ thi tại chỗ, không có tài khoản.
                                    </FieldDescription>
                                </Field>
                            </TabsContent>
                        </Tabs>

                        {error ? (
                            <p role="alert" className="text-sm text-destructive">{error.message}</p>
                        ) : null}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={close}
                                disabled={pending}
                            >
                                Huỷ
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    pending ||
                                    (mode === "enroll"
                                        ? email.trim().length === 0
                                        : name.trim().length === 0)
                                }
                            >
                                {pending
                                    ? "Đang thêm…"
                                    : mode === "enroll"
                                      ? "Ghi danh"
                                      : "Thêm"}
                            </Button>
                        </DialogFooter>
                    </FieldGroup>
                </form>
            </DialogContent>
        </Dialog>
    )
}
