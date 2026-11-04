import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { googleLoginLink, registerLink, useAuthMethods, useEntryCode, useLogin } from "@/lib/session"

/** Only a path inside this app may be the destination — never //host, never a scheme. */
function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/"
    return raw
}

const VERIFY_COPY: Record<string, string> = {
    ok: "Email đã được xác thực — giờ bạn có thể đăng nhập.",
    expired: "Liên kết xác thực đã hết hạn (24 giờ) — đăng ký lại để nhận liên kết mới.",
    invalid: "Liên kết xác thực không hợp lệ — mở lại liên kết trong email đăng ký.",
}

/**
 * /login — the player's own door: the address and password THEY chose when they
 * registered. The backend refuses until the mail link has been opened, and
 * answers the same thing for a wrong password and an unknown address (no
 * enumeration), so this page only ever shows the server's own message.
 *
 * `?next=` is honoured (the old join link's destination, now the login page's),
 * `?verify=` carries the mail link's verdict, `?notice=google-off` explains a
 * Google link that could not start.
 *
 * The second door on this page is the desk's ONE-TIME ENTRY CODE: a player who
 * forgot their password gets a single-use code from the operator (never a
 * password the operator knows), types it here, and lands on their own session.
 */
export function LoginPage() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const login = useLogin()
    const entry = useEntryCode()
    const methods = useAuthMethods()

    // "password" is the door; "entry" is the code the desk hands over the
    // counter when the password is gone. One card, two ways in — never two
    // forms stacked, so there is one submit and one error line at a time.
    const [mode, setMode] = useState<"password" | "entry">("password")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [entryCode, setEntryCode] = useState("")

    const next = safeNext(params.get("next"))
    const verify = params.get("verify")
    const notice = params.get("notice")

    const submit = (event: FormEvent) => {
        event.preventDefault()

        if (mode === "entry") {
            if (entry.isPending) return
            const typed = entryCode.trim()
            if (!typed) return
            entry.mutate(typed, {
                onSuccess: () => {
                    setEntryCode("")
                    // A session just appeared: everything cached was read without it.
                    navigate(next, { replace: true })
                },
            })
            return
        }

        if (login.isPending) return
        login.mutate(
            { email: email.trim(), password },
            {
                onSuccess: () => {
                    setPassword("")
                    // The session just changed: everything cached was read
                    // without it (the navbar's `me` read above all).
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
                                <p className="font-sans text-sm text-muted-foreground">
                                    Tài khoản thi đấu của bạn.
                                </p>
                            </div>

                            {verify && VERIFY_COPY[verify] ? (
                                <p
                                    role="status"
                                    className="rounded-md border border-border bg-muted px-3 py-2 text-center font-sans text-sm text-foreground"
                                >
                                    {VERIFY_COPY[verify]}
                                </p>
                            ) : null}

                            {notice === "google-off" ? (
                                <p className="text-center font-sans text-sm text-amber-700">
                                    Đăng nhập Google chưa được cấu hình — dùng email và mật khẩu.
                                </p>
                            ) : null}

                            {mode === "password" ? (
                                <>
                                    <Field>
                                        <FieldLabel htmlFor="login-email">Email</FieldLabel>
                                        <Input
                                            id="login-email"
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
                                </>
                            ) : (
                                <>
                                    <Field>
                                        <FieldLabel htmlFor="login-entry-code">Mã một lần</FieldLabel>
                                        <Input
                                            id="login-entry-code"
                                            value={entryCode}
                                            onChange={(event) => setEntryCode(event.target.value)}
                                            maxLength={32}
                                            autoFocus
                                            autoComplete="off"
                                            autoCapitalize="characters"
                                            spellCheck={false}
                                            placeholder="ABC234"
                                        />
                                        <FieldDescription>
                                            Ban điều hành cấp mã này khi bạn quên mật khẩu — dùng một lần,
                                            hết hạn sau 15 phút. Mật khẩu không ai biết cả.
                                        </FieldDescription>
                                    </Field>

                                    {entry.isError ? <FieldError>{entry.error.message}</FieldError> : null}
                                </>
                            )}

                            <Button
                                type="submit"
                                disabled={mode === "password" ? login.isPending : entry.isPending}
                            >
                                {mode === "password"
                                    ? login.isPending
                                        ? "Đang đăng nhập…"
                                        : "Đăng nhập"
                                    : entry.isPending
                                      ? "Đang kiểm tra…"
                                      : "Vào"}
                            </Button>

                            {mode === "password" ? (
                                <>
                                    <p className="text-center font-sans text-sm text-muted-foreground">
                                        Chưa có tài khoản?{" "}
                                        <Link
                                            to={registerLink()}
                                            className="underline underline-offset-4 hover:text-foreground"
                                        >
                                            Đăng ký
                                        </Link>
                                    </p>

                                    <p className="text-center font-sans text-sm text-muted-foreground">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMode("entry")
                                                login.reset()
                                            }}
                                            className="underline underline-offset-4 hover:text-foreground"
                                        >
                                            Quên mật khẩu? Dùng mã một lần do ban điều hành cấp
                                        </button>
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
                                </>
                            ) : (
                                <p className="text-center font-sans text-sm text-muted-foreground">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMode("password")
                                            setEntryCode("")
                                            entry.reset()
                                        }}
                                        className="underline underline-offset-4 hover:text-foreground"
                                    >
                                        Quay lại đăng nhập bằng mật khẩu
                                    </button>
                                </p>
                            )}
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
