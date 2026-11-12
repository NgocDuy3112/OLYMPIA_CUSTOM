import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { googleLoginLink, useAuthMethods, useLogin } from "@/lib/session"

function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/"
    return raw
}

export function LoginPage() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const login = useLogin()
    const methods = useAuthMethods()

    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")

    const next = safeNext(params.get("next"))
    const notice = params.get("notice")

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (login.isPending) return
        login.mutate(
            { username: username.trim(), password },
            {
                onSuccess: (session) => {
                    setPassword("")
                    if (session.mustChangePassword) {
                        navigate(`/password?next=${encodeURIComponent(next)}`, { replace: true })
                        return
                    }
                    navigate(next, { replace: true })
                },
            }
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
                                    Đăng nhập
                                </h1>
                            </div>

                            {notice === "google-off" ? (
                                <p className="text-center font-sans text-sm text-amber-700">
                                    Đăng nhập Google chưa được cấu hình — dùng tên đăng nhập và mật khẩu.
                                </p>
                            ) : null}

                            <Field>
                                <FieldLabel htmlFor="login-username">Tên đăng nhập</FieldLabel>
                                <Input
                                    id="login-username"
                                    type="text"
                                    autoComplete="username"
                                    required
                                    autoFocus
                                    maxLength={50}
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    placeholder="ngoc-duy"
                                />
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="login-password">Mật khẩu</FieldLabel>
                                <Input
                                    id="login-password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    maxLength={256}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                />
                            </Field>

                            {login.isError ? <FieldError>{login.error.message}</FieldError> : null}

                            <Button type="submit" disabled={login.isPending}>
                                {login.isPending ? "Đang đăng nhập…" : "Đăng nhập"}
                            </Button>

                            <p className="text-center font-sans text-sm text-muted-foreground">
                                Chưa có tài khoản? Liên hệ ban điều hành để được cấp — thí sinh không
                                tự đăng ký.
                            </p>

                            {methods.data?.google ? (
                                <p className="text-center font-sans text-sm text-muted-foreground">
                                    hoặc{" "}
                                    <Link
                                        to={googleLoginLink(next)}
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
                Khi vào trận, trình duyệt sẽ hỏi quyền camera và micro. Hình và tiếng chỉ phát cho ban
                điều hành, các thí sinh cùng trận và khán giả của giải.{" "}
                <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Chính sách quyền riêng tư
                </Link>
            </p>
        </div>
    )
}
