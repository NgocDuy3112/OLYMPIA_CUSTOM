import { useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { buttonVariants } from "@shared/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@shared/ui/card"
import { googleLoginLink, useAuthMethods, usePasswordLogin, usePasswordRegister } from "@/lib/session"
import { cn } from "cn"

function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/"
    return raw
}

function GoogleMark() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="size-4"
            aria-hidden="true"
        >
            <path
                d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                fill="currentColor"
            />
        </svg>
    )
}

type Mode = "login" | "register"

export function LoginPage() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const methods = useAuthMethods()
    const login = usePasswordLogin()
    const register = usePasswordRegister()

    const next = safeNext(params.get("next"))
    const notice = params.get("notice")
    const googleOff = notice === "google-off" || methods.data?.google === false

    const [mode, setMode] = useState<Mode>("login")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [displayName, setDisplayName] = useState("")

    const busy = login.isPending || register.isPending
    const error = login.error ?? register.error
    let errorText: string | null = null
    if (error instanceof Error) errorText = error.message

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (busy) return
        if (mode === "login") {
            login.mutate(
                { email, password },
                {
                    onSuccess: (result) => {
                        if (result.mustChangePassword) {
                            navigate(`/password?next=${encodeURIComponent(next)}`)
                            return
                        }
                        navigate(next)
                    },
                },
            )
            return
        }
        register.mutate(
            { email, password, displayName: displayName || undefined },
            { onSuccess: () => navigate(next) },
        )
    }

    let authSlot: ReactNode = null
    if (methods.isPending) {
        authSlot = (
            <div
                role="status"
                aria-label="Đang tải"
                className="h-9 w-full animate-pulse rounded-lg bg-muted"
            />
        )
    }
    else if (!googleOff) {
        authSlot = (
            <a
                href={googleLoginLink(next)}
                className={cn(buttonVariants({ size: "lg" }), "h-9 w-full gap-2")}
            >
                <GoogleMark />
                Đăng nhập bằng Google
            </a>
        )
    }

    const inputClass =
        "h-10 w-full rounded-lg border border-input bg-background px-3 font-sans text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"

    return (
        <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-12">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                        Đăng nhập
                    </CardTitle>
                    <CardDescription>
                        Cổng vào trận của thí sinh — dùng email và mật khẩu của bạn.
                    </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                    {authSlot}
                    {!googleOff && methods.data && (
                        <div className="flex items-center gap-3 font-sans text-xs uppercase tracking-wide text-muted-foreground">
                            <span className="h-px flex-1 bg-border" />
                            <span>hoặc</span>
                            <span className="h-px flex-1 bg-border" />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                        <button
                            type="button"
                            onClick={() => setMode("login")}
                            className={cn(
                                "rounded-md px-2 py-1.5 font-sans text-sm font-semibold transition",
                                mode === "login"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground",
                            )}
                        >
                            Đăng nhập
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode("register")}
                            className={cn(
                                "rounded-md px-2 py-1.5 font-sans text-sm font-semibold transition",
                                mode === "register"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground",
                            )}
                        >
                            Đăng ký
                        </button>
                    </div>

                    <form className="flex flex-col gap-2" onSubmit={submit}>
                        {mode === "register" && (
                            <input
                                type="text"
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                placeholder="Tên hiển thị (không bắt buộc)"
                                className={inputClass}
                                aria-label="Tên hiển thị"
                                maxLength={80}
                            />
                        )}
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Email"
                            className={inputClass}
                            aria-label="Email"
                            autoComplete="email"
                        />
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder={mode === "register" ? "Mật khẩu (tối thiểu 8 ký tự)" : "Mật khẩu"}
                            className={inputClass}
                            aria-label="Mật khẩu"
                            autoComplete={mode === "register" ? "new-password" : "current-password"}
                        />
                        {errorText && (
                            <p role="alert" className="font-sans text-sm font-medium text-destructive">
                                {errorText}
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={busy}
                            className={cn(buttonVariants({ size: "lg" }), "h-10 w-full disabled:opacity-60")}
                        >
                            {busy ? "…" : mode === "login" ? "Vào trận" : "Tạo tài khoản"}
                        </button>
                    </form>
                </CardContent>

                <CardFooter className="flex-col gap-1 text-center font-sans text-sm text-muted-foreground">
                    <span>Vào trận bằng mã mời sau khi đăng nhập.</span>
                </CardFooter>
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
