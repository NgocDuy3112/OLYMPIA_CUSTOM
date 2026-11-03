import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { StageShell } from "@shared/deck/stage-shell"
import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@shared/ui/input-otp"
import { api, ApiError } from "@shared/lib/api"

/**
 * /join — the player's door (IN THE GAMEPLAY APP — players never enter the
 * portal): type the 6-char PIN (staff read it off the matches list or the
 * match page), see who is seated, tap YOUR name.
 *
 * Backend (modules/auth/join.ts): lookup resolves the match + seats; claim mints
 * the GAMEPLAY session for that seat (user decision: match code + pick your
 * name — no password anywhere in this flow). On success the player lands in
 * /s/:slug/matches/:id — the PlayerShell deck.
 *
 * TWO decisions shape this screen:
 *
 * 1. It is drawn INSIDE the deck's frame (StageShell), not as a page of its own:
 *    the first screen of the show should look like the deck it opens. It fills
 *    the viewport (`fullHeight`) because it is a FORM on a phone — a 16:9 canvas
 *    is a 219 px letterbox at 390 px wide, which clips the card.
 * 2. There is no submit step. The code looks itself up on the sixth character
 *    and the seats appear in the same card; tapping a name IS entering. Every
 *    button removed is a tap a player does not spend holding a phone in a hall.
 *
 * The lookup is EVENT-driven, not an effect: typing is what changes the answer,
 * so the handler owns it (and a half-typed code clears the previous seats — the
 * seats belong to a code, not to the screen). A ticket guards the race: a slow
 * answer for an older code can never overwrite the newer one.
 *
 * The parts are the shared kit (the portal's own sign-in is built from the same
 * Field + InputOTP + FieldError), so the two doors cannot drift apart.
 */

interface LookupResult {
    matchId: string
    slug: string | null
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    seats: Array<{ userId: string; displayName: string }>
}

const CODE_LENGTH = 6

const statusText = (status: LookupResult["status"]) =>
    status === "LIVE" ? "đang diễn ra" : status === "UPCOMING" ? "sắp diễn ra" : "đã kết thúc"

export function JoinPage() {
    const navigate = useNavigate()
    const [code, setCode] = useState("")
    const [lookup, setLookup] = useState<LookupResult | null>(null)
    const [claiming, setClaiming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /** Which lookup answer is still wanted — a stale one is dropped. */
    const inFlight = useRef(0)

    const typeCode = (next: string) => {
        const upper = next.toUpperCase()
        setCode(upper)

        // Any edit invalidates the seats on screen: they belong to the previous code.
        if (upper.length !== CODE_LENGTH) {
            inFlight.current += 1
            setLookup(null)
            setError(null)
            return
        }

        const ticket = ++inFlight.current
        void (async () => {
            try {
                const result = await api<LookupResult>("/gameplay/join/lookup", {
                    method: "POST",
                    body: JSON.stringify({ code: upper }),
                })
                if (ticket !== inFlight.current) return
                setLookup(result)
                setError(null)
            } catch (err) {
                if (ticket !== inFlight.current) return
                setLookup(null)
                setError(
                    err instanceof ApiError && err.status === 404
                        ? "Mã không đúng — kiểm tra lại 6 ký tự từ ban điều hành."
                        : err instanceof Error ? err.message : "Không kết nối được máy chủ."
                )
            }
        })()
    }

    const claim = async (userId: string) => {
        if (!lookup || claiming) return
        setClaiming(true)
        setError(null)
        try {
            const result = await api<{ matchId: string; slug: string | null }>("/gameplay/join/claim", {
                method: "POST",
                body: JSON.stringify({ code, userId }),
            })
            // The deck lives under the tournament's route — the claim names it.
            if (result.slug) navigate(`/s/${result.slug}/matches/${result.matchId}`, { replace: true })
            else navigate("/", { replace: true })
        } catch (err) {
            setError(
                err instanceof ApiError && err.status === 403
                    ? "Ghế này không thuộc về bạn — chọn tên của mình."
                    : err instanceof ApiError && err.status === 404
                      ? "Mã đã hết hạn — xin mã mới từ ban điều hành."
                      : err instanceof Error ? err.message : "Không vào được trận."
            )
            setClaiming(false)
        }
    }

    return (
        <StageShell fullHeight>
            <div className="flex min-h-dvh items-center justify-center p-5">
                <Card className="w-full max-w-[30rem]">
                    <CardContent className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1 text-center">
                            <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                Vào trận
                            </h1>
                            <p className="font-sans text-sm text-muted-foreground">
                                Nhập mã 6 ký tự ban điều hành đọc, rồi chọn tên của bạn.
                            </p>
                        </div>

                        <Field data-invalid={error !== null || undefined}>
                            <FieldLabel htmlFor="join-code" className="justify-center">
                                Mã vào trận
                            </FieldLabel>
                            <InputOTP
                                id="join-code"
                                maxLength={CODE_LENGTH}
                                value={code}
                                onChange={typeCode}
                                disabled={claiming}
                                autoFocus
                                containerClassName="justify-center"
                            >
                                <InputOTPGroup>
                                    {Array.from({ length: CODE_LENGTH }, (_, index) => (
                                        <InputOTPSlot key={index} index={index} className="size-11 font-mono text-lg" />
                                    ))}
                                </InputOTPGroup>
                            </InputOTP>
                            {error ? <FieldError>{error}</FieldError> : null}
                        </Field>

                        {lookup ? (
                            <Field>
                                <FieldLabel className="justify-center font-normal text-muted-foreground">
                                    <span className="font-medium text-foreground">{lookup.label}</span>
                                    {" · "}
                                    {statusText(lookup.status)}
                                </FieldLabel>
                                <FieldGroup className="gap-2">
                                    <p className="text-center font-sans text-sm font-semibold text-foreground">Bạn là ai?</p>
                                    {lookup.seats.length === 0 ? (
                                        <p className="text-center font-sans text-sm text-muted-foreground">
                                            Trận này chưa có ghế — báo ban điều hành.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            {lookup.seats.map((seat) => (
                                                <Button
                                                    key={seat.userId}
                                                    type="button"
                                                    variant="outline"
                                                    size="lg"
                                                    disabled={claiming}
                                                    onClick={() => void claim(seat.userId)}
                                                    className="font-sans font-semibold"
                                                >
                                                    {seat.displayName}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </FieldGroup>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => typeCode("")}
                                    disabled={claiming}
                                    className="mx-auto text-muted-foreground"
                                >
                                    Nhập mã khác
                                </Button>
                            </Field>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </StageShell>
    )
}

export default JoinPage
