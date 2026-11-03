import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@shared/ui/input-otp"
import { api, ApiError } from "@shared/lib/api"
import { loginLink, useAuthMethods } from "@/lib/session"

/**
 * The PIN door itself — the code, the seats, "tapping a name IS entering".
 *
 * One component, two places it must appear:
 *  · `/join`, the player's own door;
 *  · the deck's "Chưa vào trận" gate, when a session expired mid-show (401) or the
 *    seat is not theirs (403). That screen used to say "nhập lại mã PIN" and hand
 *    the player a button to another page — the field belongs where the message is.
 *
 * No submit step: the code looks itself up on the sixth character and the seats
 * appear right here. Typing is what changes the answer, so the handler owns the
 * lookup (not an effect), and a ticket guards the race: a slow answer for an older
 * code can never overwrite a newer one.
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

export function PinDoor({ next = "/" }: { next?: string }) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    // Offered only when the deployment actually configured Google, so this can
    // never render a button that dead-ends.
    const methods = useAuthMethods()
    const [code, setCode] = useState("")
    const [lookup, setLookup] = useState<LookupResult | null>(null)
    const [claiming, setClaiming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /** Which lookup answer is still wanted — a stale one is dropped. */
    const inFlight = useRef(0)

    const typeCode = (nextCode: string) => {
        const upper = nextCode.toUpperCase()
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
            // The session just changed: everything cached was read WITHOUT it.
            // This matters most in the deck's own gate, where the player is
            // ALREADY on the target URL and navigating there is a no-op — without
            // this the gate would show the PIN field again, looking like a refusal.
            await queryClient.invalidateQueries()
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
        <>
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

            {methods.data?.google ? (
                <Link
                    to={loginLink(next)}
                    className="mx-auto font-sans text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    hoặc đăng nhập bằng Google
                </Link>
            ) : null}
        </>
    )
}
