import { useState, type FormEvent } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { ChevronDown, LogOut } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu"
import { useTournamentList } from "@/lib/api"
import {
    isUnauthorized,
    loginLink,
    useClaimCode,
    useLogout,
    useMe,
    useMyMatches,
    type MyMatch,
} from "@/lib/session"


const links = [
    { to: "/", label: "Lịch thi đấu", end: true },
]

export function NavBar() {
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const list = useTournamentList()
    const tournaments = list.data?.tournaments ?? []

    const slug = pathname.split("/")[2]
    const currentSlug = tournaments.find((t) => t.current)?.slug
    const viewingOtherTournament = Boolean(slug) && slug !== currentSlug

    const me = useMe()
    const logout = useLogout()
    const signedOut = isUnauthorized(me.error) || me.data === null

    const myMatches = useMyMatches({ enabled: !signedOut })
    const [enterOpen, setEnterOpen] = useState(false)

    const goToMatch = (match: MyMatch) => {
        setEnterOpen(false)
        navigate(`/s/${match.slug}/matches/${match.matchId}`)
    }

    return (
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
            <div className="mx-auto flex h-14 w-full items-center gap-4 px-4">
                <NavLink
                    to="/"
                    className="font-heading text-2xl font-bold"
                >
                    AOC
                </NavLink>
                <nav className="flex items-center gap-1">
                    {links.map(({ to, label, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) => {
                                const active =
                                    to === "/" ? isActive || pathname.startsWith("/matches") : isActive
                                return cn(
                                    buttonVariants({ variant: "ghost", size: "sm" }),
                                    active && "bg-secondary font-medium text-secondary-foreground"
                                )
                            }}
                        >
                            {label}
                        </NavLink>
                    ))}
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className={cn(
                                buttonVariants({ variant: "ghost", size: "sm" }),
                                viewingOtherTournament &&
                                "bg-secondary font-medium text-secondary-foreground"
                            )}
                        >
                            Giải đấu
                            <ChevronDown className="size-3.5" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            {tournaments.map((tournament) => (
                                <DropdownMenuItem
                                    key={tournament.id}
                                    onClick={() => navigate(`/s/${tournament.slug}`)}
                                >
                                    <span
                                        className={cn(
                                            "size-1.5 rounded-full",
                                            tournament.current ? "bg-destructive" : "bg-transparent"
                                        )}
                                        aria-hidden
                                    />
                                    {tournament.name}
                                    {tournament.current && (
                                        <span className="ml-auto text-xs text-muted-foreground">
                                            Hiện tại
                                        </span>
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Link
                        to="/privacy"
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                        Quyền riêng tư
                    </Link>
                </nav>
                {signedOut ? (
                    <div className="ml-auto flex items-center gap-2">
                        <Link
                            to={loginLink(pathname)}
                            className={cn(buttonVariants({ variant: "default", size: "lg" }))}
                        >
                            Đăng nhập
                        </Link>
                    </div>
                ) : me.data ? (
                    <div className="ml-auto flex items-center gap-2">
                        <span className="max-w-40 truncate text-sm text-muted-foreground">
                            {me.data.displayName}
                        </span>
                        <Button
                            variant="default"
                            size="lg"
                            onClick={() => {
                                void myMatches.refetch()
                                setEnterOpen(true)
                            }}
                        >
                            Vào trận
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Đăng xuất"
                            onClick={() => logout.mutate()}
                        >
                            <LogOut className="size-4" aria-hidden />
                        </Button>
                        <EnterMatchDialog
                            open={enterOpen}
                            onClose={() => setEnterOpen(false)}
                            myMatches={myMatches}
                            goToMatch={goToMatch}
                        />
                    </div>
                ) : (
                    <span className="ml-auto h-9 w-24 animate-pulse rounded-md bg-muted" />
                )}
            </div>
        </header>
    )
}

interface EnterMatchDialogProps {
    open: boolean
    onClose: () => void
    myMatches: ReturnType<typeof useMyMatches>
    goToMatch: (match: MyMatch) => void
}

function EnterMatchDialog({ open, onClose, myMatches, goToMatch }: EnterMatchDialogProps) {
    const navigate = useNavigate()
    const claim = useClaimCode()
    const [code, setCode] = useState("")

    const seats = myMatches.data?.items ?? []

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (claim.isPending) return
        const typed = code.trim()
        if (!typed) return
        claim.mutate(typed, {
            onSuccess: (match) => {
                setCode("")
                onClose()
                navigate(`/s/${match.slug}/matches/${match.matchId}`)
            },
        })
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    setCode("")
                    onClose()
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Vào trận</DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                    {myMatches.isError ? (
                        <p role="status" className="text-sm text-muted-foreground">
                            Không đọc được danh sách trận — thử lại.
                        </p>
                    ) : seats.length > 0 ? (
                        <div className="grid gap-1.5">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Ghế của bạn
                            </span>
                            {seats.map((match) => (
                                <button
                                    key={match.matchId}
                                    type="button"
                                    onClick={() => goToMatch(match)}
                                    className="flex w-full flex-col rounded-lg border px-3 py-2 text-left hover:bg-accent"
                                >
                                    <span className="text-sm font-medium">{match.tournamentName}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {match.label} ·{" "}
                                        {match.status === "LIVE" ? "đang diễn ra" : "sắp diễn ra"}
                                    </span>
                                </button>
                            ))}
                            <p className="pt-1 text-center text-xs text-muted-foreground">
                                hoặc nhập mã phòng
                            </p>
                        </div>
                    ) : null}

                    <form onSubmit={submit} className="grid gap-2">
                        <label htmlFor="room-code" className="text-sm font-medium">
                            Mã phòng
                        </label>
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
                        />
                        {claim.isError && (
                            <p role="alert" className="text-sm text-destructive">
                                {claim.error.message}
                            </p>
                        )}
                        <Button
                            type="submit"
                            disabled={claim.isPending || code.trim().length === 0}
                        >
                            {claim.isPending ? "Đang kiểm tra…" : "Vào trận"}
                        </Button>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    )
}
