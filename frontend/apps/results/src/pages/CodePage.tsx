import { useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { ApiError } from "@shared/lib/api"
import { isUnauthorized, loginLink, useClaimCode, useMe } from "@shared/session"
import { gameplayMatchUrl, openGameplayMatch } from "@shared/results/links"

function isGone(error: unknown): boolean {
    return error instanceof ApiError && error.status === 401
}

export function CodePage() {
    const me = useMe()
    const claim = useClaimCode()
    const [routeError, setRouteError] = useState<string | null>(null)
    const navigate = useNavigate()

    const [code, setCode] = useState("")

    const signedOut = isUnauthorized(me.error) || me.data === null

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (claim.isPending) return
        const typed = code.trim()
        if (!typed) return
        const tab = window.open("", "_blank")
        claim.mutate(typed, {
            onSuccess: (match) => {
                try {
                    const target = gameplayMatchUrl(match.tournamentId, match.matchId)
                    if (tab && target.startsWith("http")) {
                        tab.location.href = target
                    } else {
                        if (tab) tab.close()
                        openGameplayMatch(navigate, match.tournamentId, match.matchId)
                    }
                    setCode("")
                } catch (error) {
                    if (tab) tab.close()
                    setRouteError(error instanceof Error ? error.message : String(error))
                }
            },
        })
    }

    if (signedOut) {
        return (
            <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
                <Card>
                    <CardContent className="flex flex-col gap-4 text-center">
                        <div className="flex flex-col gap-1">
                            <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                Nhập mã
                            </h1>
                        </div>
                        <Link
                            to={loginLink("/code")}
                            className="mx-auto rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground"
                        >
                            Đăng nhập
                        </Link>
                        <p className="font-sans text-xs text-muted-foreground">
                            Chưa có tài khoản? Thí sinh không tự đăng ký — ban điều hành cấp tài khoản,
                            rồi bạn đăng nhập và lấy mã ở đây.
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const sessionGone = isGone(claim.error)

    let codeStatus: ReactNode = null
    if (routeError) {
        codeStatus = <FieldError>{routeError}</FieldError>
    } else if (claim.isError) {
        codeStatus = <FieldError>{claim.error.message}</FieldError>
    }
    if (sessionGone) {
        codeStatus = (
            <p role="status" className="font-sans text-sm text-muted-foreground">
                Phiên đã hết hạn — đăng nhập lại để dùng mã.{" "}
                <Link
                    to={loginLink("/code")}
                    className="underline underline-offset-4 hover:text-foreground"
                >
                    Đăng nhập
                </Link>
            </p>
        )
    }
    let claimLabel = "Vào trận"
    if (claim.isPending) claimLabel = "Đang kiểm tra…"

    return (
        <div className="mx-auto flex w-full max-w-96 flex-col gap-4 px-4 py-10">
            <Card>
                <CardContent>
                    <form onSubmit={submit}>
                        <FieldGroup>
                            <div className="flex flex-col gap-1 text-center">
                                <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                    Nhập mã vào trận
                                </h1>
                            </div>

                            <Field>
                                <FieldLabel htmlFor="room-code">Mã phòng</FieldLabel>
                                <Input
                                    id="room-code"
                                    value={code}
                                    onChange={(event) => setCode(event.target.value)}
                                    maxLength={32}
                                    autoFocus
                                    autoCapitalize="characters"
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="ABC234"
                                    aria-describedby="room-code-hint"
                                />
                                <p id="room-code-hint" className="font-sans text-xs text-muted-foreground">
                                    Bạn đã đăng nhập với tài khoản của mình — mã chỉ chọn trận.
                                </p>
                            </Field>

                            {codeStatus}

                            <Button type="submit" disabled={claim.isPending || code.trim().length === 0} aria-busy={claim.isPending}>
                                {claimLabel}
                            </Button>
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>

            <p className="text-center font-sans text-xs leading-relaxed text-muted-foreground">
                
                <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Chính sách quyền riêng tư
                </Link>
            </p>
        </div>
    )
}
