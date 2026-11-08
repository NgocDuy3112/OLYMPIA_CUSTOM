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

const PASSWORD_MIN = 8

function previewHandle(name: string): string {
    const ascii = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/đ/g, "d")
    const slug = ascii
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 45)
        .replace(/-+$/g, "")
    return slug.length > 0 ? slug : "player"
}

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

    const [mode, setMode] = useState("create")
    const [email, setEmail] = useState("")
    const [name, setName] = useState("")
    const [password, setPassword] = useState("")

    const close = () => {
        setName("")
        setEmail("")
        setPassword("")
        create.reset()
        enroll.reset()
        onOpenChange(false)
    }

    const submitCreate = (event: FormEvent) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || password.length < PASSWORD_MIN || create.isPending) return
        const address = email.trim()
        create.mutate(
            address
                ? { displayName: trimmed, password, email: address }
                : { displayName: trimmed, password },
            { onSuccess: close }
        )
    }

    const submitEnroll = (event: FormEvent) => {
        event.preventDefault()
        const address = email.trim()
        if (!address || enroll.isPending) return
        enroll.mutate(address, { onSuccess: close })
    }

    const error = mode === "create" ? create.error : enroll.error
    const pending = mode === "create" ? create.isPending : enroll.isPending

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
            <DialogContent>
                <form onSubmit={mode === "create" ? submitCreate : submitEnroll}>
                    <FieldGroup>
                        <DialogHeader>
                            <DialogTitle>Thêm thí sinh</DialogTitle>
                            <DialogDescription>
                                Tạo tài khoản cho thí sinh, hoặc ghi danh một tài khoản đã có.
                            </DialogDescription>
                        </DialogHeader>

                        <Tabs
                            value={mode}
                            onValueChange={(value) => {
                                setMode(value)
                                setName("")
                                setEmail("")
                                setPassword("")
                                create.reset()
                                enroll.reset()
                            }}
                        >
                            <TabsList variant="line" className="justify-start gap-6 border-b">
                                <TabsTrigger value="create">Tạo tài khoản thí sinh</TabsTrigger>
                                <TabsTrigger value="enroll">Ghi danh theo email</TabsTrigger>
                            </TabsList>

                            <TabsContent value="create">
                                <Field>
                                    <FieldLabel htmlFor="contestant-name">Tên (trên bảng đấu)</FieldLabel>
                                    <Input
                                        id="contestant-name"
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        placeholder="Ngọc Duy"
                                        maxLength={100}
                                        autoFocus
                                        required
                                    />
                                    <FieldDescription>
                                        {name.trim() ? (
                                            <>
                                                Tên đăng nhập sẽ là{" "}
                                                <span className="font-mono">{previewHandle(name)}</span> —
                                                hai thí sinh cùng tên sẽ tự thêm hậu tố.
                                            </>
                                        ) : (
                                            <>Tên đăng nhập lấy từ tên này: "Ngọc Duy" → ngoc-duy.</>
                                        )}
                                    </FieldDescription>
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="contestant-password">
                                        Mật khẩu ban điều hành cấp
                                    </FieldLabel>
                                    <Input
                                        id="contestant-password"
                                        type="text"
                                        autoComplete="off"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        placeholder="tối thiểu 8 ký tự"
                                        maxLength={256}
                                        minLength={PASSWORD_MIN}
                                        required
                                    />
                                    <FieldDescription>
                                        Dùng cho lần đăng nhập ĐẦU: thí sinh tự đặt mật khẩu riêng ngay
                                        lúc đó, và từ đó bạn không còn giữ mật khẩu nào cả.
                                    </FieldDescription>
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
                                        Chỉ để Google đăng nhập tìm thấy đúng người này. Không có email
                                        cũng không sao — tên đăng nhập mới là phần đăng nhập.
                                    </FieldDescription>
                                </Field>
                            </TabsContent>

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
                                        required
                                    />
                                    <FieldDescription>
                                        Dành cho tài khoản đã tồn tại: tạo ở giải khác, hoặc người này
                                        từng đăng nhập Google. Ban điều hành ghi danh địa chỉ — không
                                        biết và không cần mật khẩu.
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
                                    (mode === "create"
                                        ? name.trim().length === 0 || password.length < PASSWORD_MIN
                                        : email.trim().length === 0)
                                }
                            >
                                {pending
                                    ? mode === "create"
                                        ? "Đang tạo…"
                                        : "Đang ghi danh…"
                                    : mode === "create"
                                      ? "Tạo tài khoản"
                                      : "Ghi danh"}
                            </Button>
                        </DialogFooter>
                    </FieldGroup>
                </form>
            </DialogContent>
        </Dialog>
    )
}
