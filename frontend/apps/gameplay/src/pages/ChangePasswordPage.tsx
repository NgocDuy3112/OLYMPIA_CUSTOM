import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { ApiError } from "@shared/lib/api"
import { isUnauthorized, loginLink, useChangePassword, useMe } from "@/lib/session"

const PASSWORD_MIN = 8

/** Only a path inside this app — the same rule LoginPage applies to ?next=. */
function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/"
    return raw
}

/**
 * /password — where the desk's first password stops being the desk's.
 *
 * Two ways lead here, and both are the gate working: the login response says
 * `mustChangePassword`, and every other request a player in that state makes
 * comes back 409 PASSWORD_CHANGE_REQUIRED, which `api()` turns into this page
 * (with `?next=` carrying where they were headed).
 *
 * The rule it enforces in one sentence: an operator-chosen password is a
 * password the operator knows — so it works exactly once, for the sign-in that
 * ends with this form.
 */
export function ChangePasswordPage() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const me = useMe()
    const change = useChangePassword()

    const [current, setCurrent] = useState("")
    const [next1, setNext1] = useState("")
    const [confirm, setConfirm] = useState("")

    const back = safeNext(params.get("next"))
    // Only WHOAMI decides the gate: a 401 from the CHANGE itself means the
    // current password was typed wrong, not that the session is gone.
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
                    navigate(back, { replace: true })
                },
            }
        )
    }

    const mismatch = confirm.length > 0 && next1 !== confirm
    const clientError =
        next1.length > 0 && next1.length < PASSWORD_MIN
            ? `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`
            : mismatch
              ? "Hai ô mật khẩu mới chưa giống nhau."
              : null

    if (signedOut) {
        return (
            <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
                <Card>
                    <CardContent className="flex flex-col gap-4 text-center">
                        <div className="flex flex-col gap-1">
                            <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                Đặt mật khẩu
                            </h1>
                            <p className="font-sans text-sm text-muted-foreground">
                                Phiên đã hết hạn — đăng nhập lại bằng mật khẩu ban điều hành cấp, rồi
                                đặt mật khẩu của bạn.
                            </p>
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

    // A refusal from the SERVER about the current password (wrong one, or a
    // change the rules refuse) — the client's own two checks live above.
    const serverError = change.isError ? change.error : null
    const wrongCurrent =
        serverError instanceof ApiError && serverError.status === 401 ? serverError.message : null
    const otherError = serverError && !wrongCurrent ? serverError.message : null

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
                                <p className="font-sans text-sm text-muted-foreground">
                                    {me.data ? `${me.data.displayName} — ` : ""}mật khẩu ban điều hành cấp
                                    chỉ dùng cho lần đăng nhập đầu: hãy đặt mật khẩu riêng của bạn, rồi
                                    mọi thứ mở ra.
                                </p>
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

                            {clientError ? <FieldError>{clientError}</FieldError> : null}
                            {wrongCurrent ? <FieldError>{wrongCurrent}</FieldError> : null}
                            {otherError ? <FieldError>{otherError}</FieldError> : null}

                            <Button
                                type="submit"
                                disabled={change.isPending || Boolean(clientError) || next1.length < PASSWORD_MIN}
                            >
                                {change.isPending ? "Đang lưu…" : "Đặt mật khẩu"}
                            </Button>
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>

            <p className="text-center font-sans text-xs leading-relaxed text-muted-foreground">
                Đây là mật khẩu của bạn: ban điều hành cấp mật khẩu đầu tiên để bạn vào được, và mất
                quyền biết nó ngay khi bạn đổi.{" "}
                <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Chính sách quyền riêng tư
                </Link>
            </p>
        </div>
    )
}
