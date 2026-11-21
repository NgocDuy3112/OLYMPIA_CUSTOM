import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { ApiError } from "@shared/lib/api"
import { isUnauthorized, loginLink, useChangePassword, useMe } from "@shared/session"
import { authNextTarget } from "@shared/results/links"

const PASSWORD_MIN = 8

function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/"
    return raw
}

export function ChangePasswordPage() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const me = useMe()
    const change = useChangePassword()

    const [current, setCurrent] = useState("")
    const [next1, setNext1] = useState("")
    const [confirm, setConfirm] = useState("")

    const back = safeNext(params.get("next"))
    const signedOut = isUnauthorized(me.error) || me.data === null

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (change.isPending) return
        change.mutate(
            { currentPassword: current, newPassword: next1 },
            {
                onSuccess: () => {
                    setCurrent("")
                    setNext1("")
                    setConfirm("")
                    const target = authNextTarget(back); if (target.startsWith("http")) window.location.assign(target); else navigate(target, { replace: true })
                },
            }
        )
    }

    const mismatch = confirm.length > 0 && next1 !== confirm
    let clientError: string | null = null
    if (mismatch) clientError = "Hai ô mật khẩu mới chưa giống nhau."
    if (next1.length > 0) {
        if (next1.length < PASSWORD_MIN) clientError = `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`
    }

    if (signedOut) {
        return (
            <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
                <Card>
                    <CardContent className="flex flex-col gap-4 text-center">
                        <div className="flex flex-col gap-1">
                            <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                Đặt mật khẩu
                            </h1>
                        </div>
                        <Link
                            to={loginLink(`/password?next=${encodeURIComponent(back)}`)}
                            className="mx-auto rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground"
                        >
                            Đăng nhập
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    let serverError: typeof change.error = null
    if (change.isError) serverError = change.error
    let wrongCurrent: string | null = null
    if (serverError instanceof ApiError) {
        if (serverError.status === 401) wrongCurrent = serverError.message
    }
    let otherError: string | null = null
    if (serverError) {
        if (!wrongCurrent) otherError = serverError.message
    }
    let submitLabel = "Đặt mật khẩu"
    if (change.isPending) submitLabel = "Đang lưu…"

    return (
        <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
            <Card>
                <CardContent>
                    <form onSubmit={submit}>
                        <FieldGroup>
                            <div className="flex flex-col gap-1 text-center">
                                <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                    Đặt mật khẩu của bạn
                                </h1>
                            </div>

                            <Field>
                                <FieldLabel htmlFor="password-current">Mật khẩu ban điều hành cấp</FieldLabel>
                                <Input
                                    id="password-current"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    autoFocus
                                    maxLength={256}
                                    value={current}
                                    onChange={(event) => setCurrent(event.target.value)}
                                />
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="password-new">Mật khẩu mới</FieldLabel>
                                <Input
                                    id="password-new"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    minLength={PASSWORD_MIN}
                                    maxLength={256}
                                    value={next1}
                                    onChange={(event) => setNext1(event.target.value)}
                                />
                                <FieldDescription>
                                    Tối thiểu {PASSWORD_MIN} ký tự — chỉ bạn biết nó, và từ đây ban điều
                                    hành cũng không biết.
                                </FieldDescription>
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="password-confirm">Nhập lại mật khẩu mới</FieldLabel>
                                <Input
                                    id="password-confirm"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    maxLength={256}
                                    value={confirm}
                                    onChange={(event) => setConfirm(event.target.value)}
                                />
                            </Field>

                            {clientError && <FieldError>{clientError}</FieldError>}
                            {wrongCurrent && <FieldError>{wrongCurrent}</FieldError>}
                            {otherError && <FieldError>{otherError}</FieldError>}

                            <Button
                                type="submit"
                                disabled={change.isPending || Boolean(clientError) || next1.length < PASSWORD_MIN}
                            >
                                {submitLabel}
                            </Button>
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>

            <p className="text-center font-sans text-xs leading-relaxed text-muted-foreground">
                Đây là mật khẩu của bạn
                <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Chính sách quyền riêng tư
                </Link>
            </p>
        </div>
    )
}
