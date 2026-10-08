import { NavLink } from "react-router-dom";
import { buttonVariants } from "../ui/button";
import { cn } from "cn";


const links = [
    { to: "/", label: "Lịch thi đấu", end: true },
    { to: "/overview", label: "Giải đấu"},
    { to: "/standings", label: "Olympia Custom Ranking" },
]

export function NavBar() {
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
                            className={({ isActive }) =>
                                cn(
                                    buttonVariants({ variant: "ghost", size: "sm" }),
                                    isActive && "bg-secondary font-medium text-secondary-foreground"
                                )
                            }
                        >
                            {label}
                        </NavLink>
                    ))}
                </nav>
            </div>
        </header>
    )
}