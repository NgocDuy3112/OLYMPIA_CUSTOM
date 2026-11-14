import { Link, useSearchParams } from "react-router-dom"
import { buttonVariants } from "@shared/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@shared/ui/card"
import { googleLoginLink, useAuthMethods } from "@/lib/session"
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

/** Google is the only way into the player surface: the desk enrols the address,
 *  the player signs in with it. A real anchor, not a router link — the endpoint
 *  answers with a 302 to Google, which only a document request follows. */
export function LoginPage() {
    const [params] = useSearchParams()
    const methods = useAuthMethods()

    const next = safeNext(params.get("next"))
    const notice = params.get("notice")
    const googleOff = notice === "google-off" || methods.data?.google === false

    return (
        <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-12">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                        Đăng nhập
                    </CardTitle>
                    <CardDescription>
                        Cổng vào trận của thí sinh — dùng đúng tài khoản Google ban điều hành đã ghi
                        danh.
                    </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                    {googleOff ? (
                        <p role="alert" className="text-center font-sans text-sm text-amber-700">
                            Đăng nhập Google chưa được cấu hình — liên hệ ban điều hành để vào trận.
                        </p>
                    ) : methods.data ? (
                        <a
                            href={googleLoginLink(next)}
                            className={cn(buttonVariants({ size: "lg" }), "h-9 w-full gap-2")}
                        >
                            <GoogleMark />
                            Đăng nhập bằng Google
                        </a>
                    ) : (
                        <div
                            role="status"
                            aria-label="Đang tải"
                            className="h-9 w-full animate-pulse rounded-lg bg-muted"
                        />
                    )}
                </CardContent>

                <CardFooter className="flex-col gap-1 text-center font-sans text-sm text-muted-foreground">
                    <span>Chưa có tài khoản?</span>
                    <span>Liên hệ ban điều hành để được ghi danh giải.</span>
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
