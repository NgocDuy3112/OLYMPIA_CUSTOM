import { Link, Outlet, useLocation } from "react-router-dom"
import { BookOpen, KeyRound, Trophy, Users } from "lucide-react"
import { useMe } from "@/lib/session"


const NAV = [
    {
        to: "/",
        label: "Tournaments",
        icon: Trophy,
        match: (path: string) => path === "/" || path.startsWith("/tournaments"),
    },
    { to: "/questions", label: "Questions", icon: BookOpen, match: (p: string) => p.startsWith("/questions") },
    { to: "/mcp-keys", label: "MCP keys", icon: KeyRound, match: (p: string) => p.startsWith("/mcp-keys") },
    { to: "/operators", label: "Operators", icon: Users, match: (p: string) => p.startsWith("/operators"), adminOnly: true },
] as const


export function PortalShell() {
    const { data: me } = useMe()
    const { pathname } = useLocation()

    return (
        <div className="flex min-h-dvh">
            <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/30">
                <Link
                    to="/"
                    className="flex items-center gap-2 border-b px-4 py-4 font-medium transition-colors hover:text-primary"
                >
                    <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
                        aria-hidden
                    >
                        O
                    </span>
                    Olympia Custom
                </Link>

                <nav className="flex flex-col gap-1 p-2">
                    {NAV.map((item) => {
                        if ("adminOnly" in item && item.adminOnly && me?.role !== "ADMIN") return null
                        const active = item.match(pathname)
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                aria-current={active ? "page" : undefined}
                                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                            >
                                <Icon className="size-4 shrink-0" aria-hidden />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
            </aside>

            <main className="min-w-0 flex-1">
                <Outlet />
            </main>
        </div>
    )
}
