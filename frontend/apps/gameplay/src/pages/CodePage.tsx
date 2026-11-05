import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { ApiError } from "@shared/lib/api"
import { isUnauthorized, loginLink, useClaimCode, useMe } from "@/lib/session"

/** Only a path inside this app — the same rule LoginPage applies to ?next=. */
function isGone(error: unknown): boolean {
    return error instanceof ApiError && error.status === 401
}

/**
 * /code — the walk-in's door.
 *
 * The desk reads a room code aloud; the player types it here and lands in the
 * match it names. It is HALF an entrance on purpose: the code says WHICH room
 * is open, the account says WHO the player is, so a signed-out visitor is sent
 * to the login door with this page waiting as `?next=` — the same round trip
 * every other gate in the app makes.
 *
 * No name is ever typed here. Identity is not chosen at the door, which is the
 * whole reason the old PIN path was deleted.
 */
export function CodePage() {
    const me = useMe()
    const claim = useClaimCode()
    const navigate = useNavigate()

    const [code, setCode] = useState("")

    // A definitive 401 means the session is gone; while `me` is still pending
    // the form stands (flashing a login gate at a signed-in player is worse).
    const signedOut = isUnauthorized(me.error) || me.data === null

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (claim.isPending) return
        const typed = code.trim()
        if (!typed) return
        claim.mutate(typed, {
            onSuccess: (match) => {
                setCode("")
                navigate(`/s/${match.slug}/matches/${match.matchId}`)
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
                            <p className="font-sans text-sm text-muted-foreground">
                                Mã vào trận chỉ mở được khi bạn đã đăng nhập — mã nói trận nào mở, tài
                                khoản nói bạn là ai.
                            </p>
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

    // The session died while the page was open: the message says so, and the
    // door that fixes it carries this page (and the typed code's destination).
    const sessionGone = isGone(claim.error)

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
                                <p className="font-sans text-sm text-muted-foreground">
                                    Mã do ban điều hành cấp cho phòng thi — gõ để vào ghế của bạn.
                                </p>
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

                            {sessionGone ? (
                                <p role="status" className="font-sans text-sm text-muted-foreground">
                                    Phiên đã hết hạn — đăng nhập lại để dùng mã.{" "}
                                    <Link
                                        to={loginLink("/code")}
                                        className="underline underline-offset-4 hover:text-foreground"
                                    >
                                        Đăng nhập
                                    </Link>
                                </p>
                            ) : claim.isError ? (
                                <FieldError>{claim.error.message}</FieldError>
                            ) : null}

                            <Button type="submit" disabled={claim.isPending || code.trim().length === 0}>
                                {claim.isPending ? "Đang kiểm tra…" : "Vào trận"}
                            </Button>
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>

            <p className="text-center font-sans text-xs leading-relaxed text-muted-foreground">
                Chưa có chỗ ngồi? Vào trận bằng nút{" "}
                <span className="font-medium text-foreground">Vào trận</span> trên thanh điều hướng —
                đó là ghế ban điều hành đã xếp cho bạn.{" "}
                <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Chính sách quyền riêng tư
                </Link>
            </p>
        </div>
    )
}
