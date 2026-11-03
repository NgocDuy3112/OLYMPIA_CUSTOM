import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { StageShell } from "@shared/deck/stage-shell"
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
 * It is drawn INSIDE the deck's frame (StageShell), not as a page of its own:
 * this is the first screen of the show a player sees, so it should look like the
 * deck they are about to sit in — same canvas, same card, same palette.
 *
 * But it is a FORM on a phone, not a deck for a projector: the canvas fills the
 * viewport (`fullHeight`) instead of holding 16:9, and the type has a legibility
 * floor. A 390 px phone is the common case here, not the exception.
 */

interface LookupResult {
    matchId: string
    slug: string | null
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    seats: Array<{ userId: string; displayName: string }>
}

/** Type with a floor: the canvas is the deck's, the reader is on a phone. */
const FIELD = { fontSize: "clamp(16px, 2.1cqw, 24px)" } as const
const HEADLINE = { fontSize: "clamp(22px, 3.2cqw, 40px)" } as const
const BODY = { fontSize: "clamp(13px, 1.35cqw, 17px)" } as const

const statusText = (status: LookupResult["status"]) =>
    status === "LIVE" ? "đang diễn ra" : status === "UPCOMING" ? "sắp diễn ra" : "đã kết thúc"

export function JoinPage() {
    const navigate = useNavigate()
    const [code, setCode] = useState("")
    const [lookup, setLookup] = useState<LookupResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submitCode = async (event: FormEvent) => {
        event.preventDefault()
        const trimmed = code.trim().toUpperCase()
        if (trimmed.length !== 6 || busy) return
        setBusy(true)
        setError(null)
        try {
            const result = await api<LookupResult>("/gameplay/join/lookup", {
                method: "POST",
                body: JSON.stringify({ code: trimmed }),
            })
            setLookup(result)
            setCode(trimmed)
        } catch (err) {
            setError(
                err instanceof ApiError && err.status === 404
                    ? "Mã không đúng — kiểm tra lại 6 ký tự từ ban điều hành."
                    : err instanceof Error ? err.message : "Không kết nối được máy chủ."
            )
        } finally {
            setBusy(false)
        }
    }

    const claim = async (userId: string) => {
        if (!lookup || busy) return
        setBusy(true)
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
            setBusy(false)
        }
    }

    const forget = () => {
        setLookup(null)
        setError(null)
    }

    return (
        <StageShell fullHeight>
            <div className="flex min-h-dvh items-center justify-center p-5">
                <div className="flex w-full max-w-[30rem] flex-col gap-4 rounded-2xl bg-card p-6 shadow-md ring-1 ring-border">
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h1 className="font-display font-bold uppercase leading-none text-foreground" style={HEADLINE}>
                            Vào trận
                        </h1>
                        <p className="font-sans leading-relaxed text-muted-foreground" style={BODY}>
                            Nhập mã 6 ký tự ban điều hành đọc, rồi chọn tên của bạn.
                        </p>
                    </div>

                    <form onSubmit={submitCode} className="flex items-stretch gap-2">
                        <input
                            type="text"
                            inputMode="text"
                            autoCapitalize="characters"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={6}
                            value={code}
                            onChange={(event) => setCode(event.target.value.toUpperCase())}
                            placeholder="ABC123"
                            aria-label="Mã vào trận"
                            disabled={lookup !== null}
                            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-center font-mono uppercase tracking-[0.35em] outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                            style={FIELD}
                        />
                        <button
                            type="submit"
                            disabled={code.trim().length !== 6 || busy || lookup !== null}
                            className="shrink-0 rounded-lg bg-primary px-5 font-sans font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                            style={BODY}
                        >
                            {busy && !lookup ? "…" : "Vào"}
                        </button>
                    </form>

                    {lookup ? (
                        <div className="flex flex-col gap-2">
                            <p className="text-center font-sans text-muted-foreground" style={BODY}>
                                <span className="font-medium text-foreground">{lookup.label}</span>
                                {" · "}
                                {statusText(lookup.status)}
                            </p>
                            <p className="text-center font-sans font-semibold text-foreground" style={BODY}>
                                Bạn là ai?
                            </p>
                            <ul className="grid grid-cols-2 gap-2">
                                {lookup.seats.map((seat) => (
                                    <li key={seat.userId}>
                                        <button
                                            type="button"
                                            onClick={() => void claim(seat.userId)}
                                            disabled={busy}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 font-sans font-semibold text-foreground transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                                            style={BODY}
                                        >
                                            {seat.displayName}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {lookup.seats.length === 0 ? (
                                <p className="text-center font-sans text-muted-foreground" style={BODY}>
                                    Trận này chưa có ghế — báo ban điều hành.
                                </p>
                            ) : null}
                        </div>
                    ) : null}

                    {error ? (
                        <p role="alert" className="text-center font-sans text-destructive" style={BODY}>
                            {error}
                        </p>
                    ) : null}

                    {lookup ? (
                        <button
                            type="button"
                            onClick={forget}
                            className="mx-auto font-sans text-muted-foreground underline-offset-4 hover:underline"
                            style={BODY}
                        >
                            Nhập mã khác
                        </button>
                    ) : null}
                </div>
            </div>
        </StageShell>
    )
}

export default JoinPage
