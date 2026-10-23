import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@shared/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu"
import { useTournamentList } from "@/lib/api"


const links = [
    { to: "/", label: "Lịch thi đấu", end: true },
    { to: "/standings", label: "Olympia Custom Ranking" },
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
                </nav>
                <NavLink
                    to="/login"
                    className={({ isActive }) =>
                        cn(
                            buttonVariants({ variant: "default", size: "lg" }),
                            "ml-auto",
                            isActive && "bg-secondary font-medium text-secondary-foreground"
                        )
                    }
                >
                    Đăng nhập
                </NavLink>
            </div>
        </header>
    )
}