import { useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { googleLoginLink, loginLink, useAuthMethods, useRegister } from "@/lib/session"

/**
 * /register — the player makes THEIR OWN account: an address and a password
 * nobody at the desk ever sees. On success there is NO session: the backend
 * mailed a 24-hour link and the account is unusable until it is opened, so the
 * screen says exactly that and nothing pretends the mail arrived (on a dev box
 * without SMTP the link is in the backend log — the wording stays neutral
 * because only the backend knows, and it cannot say so over this API).
 *
 * Drawn as a page of the show (inside AppShell): the navbar is where the player
 * will see their name after they sign in, so the door sits under it too.
 */
export function RegisterPage() {
    const [params] = useSearchParams()
    const register = useRegister()
    const methods = useAuthMethods()

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [displayName, setDisplayName] = useState("")

    // A stale Google link lands here with a reason; the password door always works.
    const notice = params.get("notice")

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (register.isPending) return
        register.mutate({
            email: email.trim(),
            password,
            ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        })
    }

    if (register.data) {
        return (
            <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
                <Card>
                    <CardContent className="flex flex-col gap-4 text-center">
                        <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                            Kiểm tra email
                        </h1>
                        <p className="font-sans text-sm leading-relaxed text-muted-foreground">
                            Chúng tôi đã gửi liên kết xác thực tới{" "}
                            <b className="text-foreground">{register.data.to}</b>. Bấm vào liên kết trong
                            email để kích hoạt tài khoản (liên kết có hiệu lực 24 giờ), rồi đăng nhập.
                        </p>
                        <p className="font-sans text-xs leading-relaxed text-muted-foreground">
                            Không thấy email? Kiểm tra thư rác, hoặc thử địa chỉ khác.
                        </p>
                        <Link
                            to={loginLink()}
                            className="mx-auto font-sans text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                            Đã có tài khoản? Đăng nhập
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
            <Card>
                <CardContent>
                    <form onSubmit={submit}>
                        <FieldGroup>
                            <div className="flex flex-col gap-1 text-center">
                                <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                    Đăng ký
                                </h1>
                                <p className="font-sans text-sm text-muted-foreground">
                                    Tạo tài khoản thi đấu của riêng bạn.
                                </p>
                                {notice === "google-off" ? (
                                    <p className="font-sans text-sm text-amber-700">
                                        Đăng nhập Google chưa được cấu hình — dùng email và mật khẩu.
                                    </p>
                                ) : null}
                            </div>

                            <Field>
                                <FieldLabel htmlFor="register-email">Email</FieldLabel>
                                <Input
                                    id="register-email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    autoFocus
                                    maxLength={255}
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="email@example.com"
                                />
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="register-name">Tên hiển thị (không bắt buộc)</FieldLabel>
                                <Input
                                    id="register-name"
                                    autoComplete="nickname"
                                    maxLength={100}
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    placeholder="Tên hiện trên bảng đấu"
                                />
                                <FieldDescription>Bỏ trống sẽ lấy tên từ email của bạn.</FieldDescription>
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="register-password">Mật khẩu</FieldLabel>
                                <Input
                                    id="register-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    maxLength={256}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Tối thiểu 8 ký tự"
                                />
                            </Field>

                            {register.isError ? (
                                <FieldError>{register.error.message}</FieldError>
                            ) : null}

                            <Button type="submit" disabled={register.isPending}>
                                {register.isPending ? "Đang đăng ký…" : "Đăng ký"}
                            </Button>

                            <p className="text-center font-sans text-sm text-muted-foreground">
                                Đã có tài khoản?{" "}
                                <Link
                                    to={loginLink()}
                                    className="underline underline-offset-4 hover:text-foreground"
                                >
                                    Đăng nhập
                                </Link>
                            </p>

                            {methods.data?.google ? (
                                <p className="text-center font-sans text-sm text-muted-foreground">
                                    hoặc{" "}
                                    <Link
                                        to={googleLoginLink()}
                                        className="underline underline-offset-4 hover:text-foreground"
                                    >
                                        đăng nhập bằng Google
                                    </Link>
                                </p>
                            ) : null}
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>

            <p className="text-center font-sans text-xs leading-relaxed text-muted-foreground">
                Khi vào trận, trình duyệt sẽ hỏi quyền camera và micro.{" "}
                <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Chính sách quyền riêng tư
                </Link>
            </p>
        </div>
    )
}
