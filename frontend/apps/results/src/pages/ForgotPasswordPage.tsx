import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@shared/ui/input-otp"
import { useForgotPassword, useResetPassword } from "@shared/session"

const PASSWORD_MIN = 8
const CODE_LENGTH = 6

type Step = "email" | "code"

export function ForgotPasswordPage() {
    const navigate = useNavigate()
    const forgot = useForgotPassword()
    const reset = useResetPassword()

    const [step, setStep] = useState<Step>("email")
    const [email, setEmail] = useState("")
    const [code, setCode] = useState("")
    const [next1, setNext1] = useState("")
    const [confirm, setConfirm] = useState("")

    const mismatch = confirm.length > 0 && next1 !== confirm
    let clientError: string | null = null
    if (mismatch) clientError = "Hai ô mật khẩu mới chưa giống nhau."
    if (next1.length > 0) {
        if (next1.length < PASSWORD_MIN) clientError = `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`
    }

    const submitEmail = (event: FormEvent) => {
        event.preventDefault()
        if (forgot.isPending) return
        forgot.mutate(
            { email },
            {
                onSuccess: () => {
                    setStep("code")
                },
            }
        )
    }

    const submitReset = (event: FormEvent) => {
        event.preventDefault()
        if (reset.isPending) return
        if (clientError) return
        reset.mutate(
            { email, code, newPassword: next1 },
            {
                onSuccess: () => {
                    navigate("/login", { replace: true })
                },
            }
        )
    }

    let emailDisabled = false
    if (forgot.isPending) emailDisabled = true
    if (email.trim().length === 0) emailDisabled = true

    let emailLabel = "Gửi mã"
    if (forgot.isPending) emailLabel = "Đang gửi…"

    let resetDisabled = false
    if (reset.isPending) resetDisabled = true
    if (code.length !== CODE_LENGTH) resetDisabled = true
    if (next1.length < PASSWORD_MIN) resetDisabled = true
    if (clientError) resetDisabled = true

    let resetLabel = "Đặt mật khẩu mới"
    if (reset.isPending) resetLabel = "Đang lưu…"

    let resetServerError: string | null = null
    if (reset.error) resetServerError = reset.error.message

    let forgotServerError: string | null = null
    if (forgot.error) forgotServerError = forgot.error.message

    if (step === "code") {
        return (
            <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
                <Card>
                    <CardContent>
                        <form onSubmit={submitReset}>
                            <FieldGroup>
                                <div className="flex flex-col gap-1 text-center">
                                    <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                        Đặt mật khẩu mới
                                    </h1>
                                    <p className="font-sans text-sm text-muted-foreground">
                                        Mã đã gửi tới {email}.
                                    </p>
                                </div>

                                <Field>
                                    <FieldLabel>Mã xác nhận</FieldLabel>
                                    <InputOTP
                                        maxLength={CODE_LENGTH}
                                        value={code}
                                        onChange={setCode}
                                        aria-label="Mã xác nhận"
                                        containerClassName="justify-center"
                                    >
                                        <InputOTPGroup>
                                            {Array.from({ length: CODE_LENGTH }, (_, index) => (
                                                <InputOTPSlot key={index} index={index} />
                                            ))}
                                        </InputOTPGroup>
                                    </InputOTP>
                                    <FieldDescription>
                                        Mã gồm {CODE_LENGTH} chữ số, hiệu lực 10 phút.
                                    </FieldDescription>
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="forgot-new">Mật khẩu mới</FieldLabel>
                                    <Input
                                        id="forgot-new"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        minLength={PASSWORD_MIN}
                                        maxLength={256}
                                        value={next1}
                                        onChange={(event) => setNext1(event.target.value)}
                                    />
                                    <FieldDescription>
                                        Tối thiểu {PASSWORD_MIN} ký tự.
                                    </FieldDescription>
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="forgot-confirm">Nhập lại mật khẩu mới</FieldLabel>
                                    <Input
                                        id="forgot-confirm"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        maxLength={256}
                                        value={confirm}
                                        onChange={(event) => setConfirm(event.target.value)}
                                    />
                                </Field>

                                {clientError && <FieldError>{clientError}</FieldError>}
                                {resetServerError && <FieldError>{resetServerError}</FieldError>}

                                <Button type="submit" disabled={resetDisabled}>
                                    {resetLabel}
                                </Button>
                            </FieldGroup>
                        </form>
                    </CardContent>
                </Card>

                <p className="text-center font-sans text-xs leading-relaxed text-muted-foreground">
                    <Link to="/login" className="underline underline-offset-2 hover:text-foreground">
                        Quay lại đăng nhập
                    </Link>
                </p>
            </div>
        )
    }

    return (
        <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
            <Card>
                <CardContent>
                    <form onSubmit={submitEmail}>
                        <FieldGroup>
                            <div className="flex flex-col gap-1 text-center">
                                <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                    Quên mật khẩu
                                </h1>
                                <p className="font-sans text-sm text-muted-foreground">
                                    Nhập email của bạn, mã xác nhận sẽ được gửi tới đó.
                                </p>
                            </div>

                            <Field>
                                <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
                                <Input
                                    id="forgot-email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    autoFocus
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                />
                            </Field>

                            {forgotServerError && <FieldError>{forgotServerError}</FieldError>}

                            <Button type="submit" disabled={emailDisabled}>
                                {emailLabel}
                            </Button>
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>

            <p className="text-center font-sans text-xs leading-relaxed text-muted-foreground">
                <Link to="/login" className="underline underline-offset-2 hover:text-foreground">
                    Quay lại đăng nhập
                </Link>
            </p>
        </div>
    )
}
