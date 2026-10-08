import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "../ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SEASONS, CURRENT_SEASON } from "@/data/seasons"


const links = [
    { to: "/", label: "Lịch thi đấu", end: true },
    { to: "/standings", label: "Olympia Custom Ranking" },
]

export function NavBar() {
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const seasonId = pathname.split("/")[2]            // /s/:seasonId/…
    const viewingOtherSeason = Boolean(seasonId) && seasonId !== CURRENT_SEASON.id

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
                                viewingOtherSeason &&
                                "bg-secondary font-medium text-secondary-foreground"
                            )}
                        >
                            Giải đấu
                            <ChevronDown className="size-3.5" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            {SEASONS.map((season) => (
                                <DropdownMenuItem
                                    key={season.id}
                                    onClick={() => navigate(`/s/${season.id}`)}
                                >
                                    <span
                                        className={cn(
                                            "size-1.5 rounded-full",
                                            season.current ? "bg-destructive" : "bg-transparent"
                                        )}
                                        aria-hidden
                                    />
                                    {season.name}
                                    {season.current && (
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