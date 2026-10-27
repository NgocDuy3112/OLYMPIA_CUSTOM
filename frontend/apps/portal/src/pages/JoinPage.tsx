import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { api, ApiError } from "@shared/lib/api"

/**
 * /join — the player's door: type the 6-char PIN (staff read it off the matches
 * list or the match page), see who is seated, tap YOUR name.
 *
 * Backend (modules/auth/join.ts): lookup resolves the match + seats; claim mints
 * the GAMEPLAY session for that seat (user decision: match code + pick your
 * name — no password anywhere in this flow). On success the player lands in
 * /play/:matchId — the PlayerShell.
 */

interface LookupResult {
    matchId: string
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    seats: Array<{ userId: string; displayName: string }>
}

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
                    ? "Mã không đúng — kiểm tra lại 6 ký tự từ MC."
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
            await api<{ matchId: string }>("/gameplay/join/claim", {
                method: "POST",
                body: JSON.stringify({ code, userId }),
            })
            navigate(`/play/${lookup.matchId}`, { replace: true })
        } catch (err) {
            setError(
                err instanceof ApiError && err.status === 403
                    ? "Ghế này không thuộc về bạn — chọn tên của mình."
                    : err instanceof ApiError && err.status === 404
                      ? "Mã đã hết hạn — xin mã mới từ MC."
                      : err instanceof Error ? err.message : "Không vào được trận."
            )
            setBusy(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
            <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
                <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground">
                    Vào trận
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Nhập mã 6 ký tự MC đọc, rồi chọn tên của bạn.
                </p>

                <form onSubmit={submitCode} className="mt-5 flex gap-2">
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
                        className="w-full min-w-0 rounded-lg border border-input bg-background px-4 py-3 font-mono text-xl uppercase tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                        type="submit"
                        disabled={code.trim().length !== 6 || busy}
                        className="shrink-0 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                    >
                        {busy ? "…" : "Vào"}
                    </button>
                </form>

                {lookup && (
                    <div className="mt-5">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{lookup.label}</span>
                            {" · "}
                            {lookup.status === "LIVE" ? "đang diễn ra" : lookup.status === "UPCOMING" ? "sắp diễn ra" : "đã kết thúc"}
                        </p>
                        <p className="mt-3 text-sm font-medium">Bạn là ai?</p>
                        <ul className="mt-2 flex flex-col gap-2">
                            {lookup.seats.map((seat) => (
                                <li key={seat.userId}>
                                    <button
                                        type="button"
                                        onClick={() => void claim(seat.userId)}
                                        disabled={busy}
                                        className="w-full rounded-lg border bg-background px-4 py-3 text-left text-sm font-semibold text-foreground transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                                    >
                                        {seat.displayName}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {lookup.seats.length === 0 && (
                            <p className="mt-2 text-sm text-muted-foreground">Trận này chưa có ghế — báo MC.</p>
                        )}
                    </div>
                )}

                {error && (
                    <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>
                )}

                {lookup && (
                    <button
                        type="button"
                        onClick={() => { setLookup(null); setError(null) }}
                        className="mt-5 text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                        Nhập mã khác
                    </button>
                )}
            </div>
        </div>
    )
}

export default JoinPage
