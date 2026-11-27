import { useState, type FormEvent, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog"
import { Button } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import { useClaimCode, useMyMatches, type MyMatch } from "@shared/session"
import { gameplayMatchUrl, openGameplayMatch } from "@shared/results/links"

interface EnterMatchDialogProps {
    open: boolean
    onClose: () => void
}

export function EnterMatchDialog({ open, onClose }: EnterMatchDialogProps) {
    const navigate = useNavigate()
    const myMatches = useMyMatches({ enabled: open })
    const claim = useClaimCode()
    const [code, setCode] = useState("")
    const [routeError, setRouteError] = useState<string | null>(null)

    const seats = myMatches.data?.items ?? []

    const goToMatch = (match: MyMatch) => {
        setCode("")
        onClose()
        openGameplayMatch(navigate, match.tournamentId, match.matchId)
    }

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (claim.isPending) return
        const typed = code.trim()
        if (!typed) return
        // open the tab inside the click gesture — window.open after the async
        // claim would be blocked as a popup
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
                    onClose()
                } catch (error) {
                    if (tab) tab.close()
                    setRouteError(error instanceof Error ? error.message : String(error))
                }
            },
        })
    }

    let seatsSlot: ReactNode = null
    if (myMatches.isPending) {
        seatsSlot = (
            <p role="status" className="text-sm text-muted-foreground">
                Đang tải ghế của bạn…
            </p>
        )
    } else if (seats.length > 0) {
        seatsSlot = (
            <div className="grid gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Ghế của bạn
                </span>
                {seats.map((match) => {
                    let statusText = "sắp diễn ra"
                    if (match.status === "LIVE") statusText = "đang diễn ra"
                    return (
                        <button
                            key={match.matchId}
                            type="button"
                            onClick={() => goToMatch(match)}
                            className="flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="text-sm font-medium">{match.tournamentName}</span>
                            <span className="text-xs text-muted-foreground">
                                {match.label} · {statusText}
                            </span>
                        </button>
                    )
                })}
                <p className="pt-1 text-center text-xs text-muted-foreground">hoặc nhập mã phòng</p>
            </div>
        )
    }
    if (myMatches.isError) {
        seatsSlot = (
            <p role="status" className="text-sm text-muted-foreground">
                Không đọc được danh sách trận — thử lại.
            </p>
        )
    } else if (!myMatches.isPending && seats.length === 0) {
        seatsSlot = (
            <p className="text-sm text-muted-foreground">
                Bạn chưa có ghế nào trong giải — ban điều hành sẽ xếp bạn vào trận.
            </p>
        )
    }
    let claimLabel = "Vào trận"
    if (claim.isPending) claimLabel = "Đang kiểm tra…"
    const codeDisabled = true // tạm tắt mã phòng — sẽ chuyển sang trang Khán giả tương tác

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    setCode("")
                    setRouteError(null)
                    onClose()
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Vào trận</DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                    {seatsSlot}

                    <p className="text-xs text-muted-foreground">
                        Mã phòng tạm khoá — phần Khán giả tương tác đang được dựng.
                    </p>
                    <form onSubmit={submit} className="grid gap-2" aria-busy={claim.isPending}>
                        <label htmlFor="room-code" className="text-sm font-medium">
                            Mã phòng
                        </label>
                        <Input
                            id="room-code"
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            maxLength={32}
                            disabled={codeDisabled}
                            autoFocus
                            autoCapitalize="characters"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="ABC234"
                        />
                        {claim.isError && (
                            <p role="alert" className="text-sm text-destructive">
                                {claim.error.message}
                            </p>
                        )}
                        {routeError && (
                            <p role="alert" className="text-sm text-destructive">{routeError}</p>
                        )}
                        <Button type="submit" disabled={codeDisabled || claim.isPending || code.trim().length === 0} aria-busy={claim.isPending}>
                            {claimLabel}
                        </Button>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    )
}
