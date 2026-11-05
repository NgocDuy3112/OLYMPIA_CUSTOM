import { useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { ChevronDown, LogOut } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@shared/ui/button"
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

    // The slug owns the URL: /s/:slug/…
    const slug = pathname.split("/")[2]
    const currentSlug = tournaments.find((t) => t.current)?.slug
    const viewingOtherTournament = Boolean(slug) && slug !== currentSlug

    const me = useMe()
    const logout = useLogout()
    // Pending or a real error: show the login link rather than flash a name for
    // a player who is signed in. Only a definitive 401 means "signed out".
    const signedOut = isUnauthorized(me.error) || me.data === null

    // "Vào trận" reads the seats THIS player holds — only worth asking once the
    // session says who they are (a signed-out ask would just be a 401).
    const myMatches = useMyMatches({ enabled: !signedOut })
    const [matchNotice, setMatchNotice] = useState<string | null>(null)
    /** Several seats: the pick list is open (its items call goToMatch). */
    const [pickOpen, setPickOpen] = useState(false)

    /** One click to the deck: 0 seats → say so; 1 → go; several → pick. */
    const enterMatch = async () => {
        setMatchNotice(null)
        const result = await myMatches.refetch()
        const items = result.data?.items ?? []
        if (result.error || !result.data) {
            setMatchNotice("Không đọc được danh sách trận — thử lại.")
            return
        }
        if (items.length === 0) {
            setMatchNotice("Bạn chưa có trận — ban điều hành chưa xếp ghế.")
            return
        }
        if (items.length === 1) {
            goToMatch(items[0]!)
            return
        }
        // Several: the list IS the choice (newest first already).
        setPickOpen(true)
    }

    const goToMatch = (match: MyMatch) => {
        setPickOpen(false)
        setMatchNotice(null)
        navigate(`/s/${match.slug}/matches/${match.matchId}`)
    }

    return (
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
            <div className="mx-auto flex h-14 w-full items-center gap-4 px-4">
                <NavLink
                    to="/"
                    className="font-heading text-2xl font-bold"
                >
                    Olympia Custom
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
                    // The desk issued this player an account, so the navbar
                    // offers the door it leads to (`?next=` remembered here).
                    // "Nhập mã" goes to the login door FIRST — a room code only
                    // works with the session that says who is typing it — and
                    // carries the code box back as ?next=.
                    <div className="ml-auto flex items-center gap-2">
                        <Link
                            to={loginLink("/code")}
                            className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
                        >
                            Nhập mã
                        </Link>
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
                        {matchNotice ? (
                            <span role="status" className="max-w-56 truncate font-sans text-xs text-muted-foreground">
                                {matchNotice}
                            </span>
                        ) : null}
                        <div className="relative">
                            <Button
                                variant="default"
                                size="lg"
                                disabled={myMatches.isFetching}
                                aria-expanded={pickOpen}
                                onClick={() => {
                                    // A pick already open: close it (the list is
                                    // the choice, not a second fetch).
                                    if (pickOpen) {
                                        setPickOpen(false)
                                        return
                                    }
                                    void enterMatch()
                                }}
                            >
                                {myMatches.isFetching ? "Đang tìm…" : "Vào trận"}
                            </Button>
                            {pickOpen ? (
                                <div
                                    role="menu"
                                    aria-label="Chọn trận"
                                    className="absolute right-0 top-full z-50 mt-1 min-w-56 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10"
                                >
                                    {(myMatches.data?.items ?? []).map((match) => (
                                        <button
                                            key={match.matchId}
                                            type="button"
                                            role="menuitem"
                                            onClick={() => goToMatch(match)}
                                            className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent"
                                        >
                                            <span className="text-sm font-medium">{match.tournamentName}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {match.label} · {match.status === "LIVE" ? "đang diễn ra" : "sắp diễn ra"}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        {/* The OTHER way into a match: a seat nobody pre-assigned,
                            claimed with the room code the desk reads out. Same
                            account — the code only says which room. */}
                        <Link
                            to="/code"
                            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                        >
                            Nhập mã
                        </Link>
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Đăng xuất"
                            onClick={() => logout.mutate()}
                        >
                            <LogOut className="size-4" aria-hidden />
                        </Button>
                    </div>
                ) : (
                    // Checking the session: hold the space, show nothing.
                    <span className="ml-auto h-9 w-24 animate-pulse rounded-md bg-muted" />
                )}
            </div>
        </header>
    )
}